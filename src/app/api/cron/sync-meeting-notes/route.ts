// v6.0 Cron: Gemini会議メモ自動取得（v10.1: マルチユーザー対応）
// スケジュール: 毎時 00分（1時間ごと）
// Google連携済みの全ユーザーのカレンダーから過去3時間の完了済みGoogle Meetイベントを検出
// Gemini会議メモ（添付Google Docs）を取得し、meeting_records に自動登録
// ※ 取り込み済みイベントはsource_file_id（カレンダーイベントID）で重複チェック済み（スキップ）

import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const urlSecret = request.nextUrl.searchParams.get('secret');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && urlSecret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[SyncMeetingNotes] Cron開始');

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'DB接続エラー' }, { status: 500 });
    }

    // Calendar API / Meeting Note Fetcher を動的import
    const { getEvents } = await import('@/services/calendar/calendarClient.service');
    const {
      isGoogleMeetEvent,
      fetchMeetingNoteFromEvent,
    } = await import('@/services/gemini/meetingNoteFetcher.service');
    const { parseGeminiNotes } = await import('@/services/gemini/geminiParser.service');

    // ========================================
    // マルチユーザー: Google連携済みの全ユーザーを取得
    // ========================================
    const { data: tokens } = await supabase
      .from('user_service_tokens')
      .select('user_id, token_data')
      .eq('service_name', 'gmail')
      .eq('is_active', true);

    if (!tokens || tokens.length === 0) {
      console.log('[SyncMeetingNotes] Google連携済みユーザーなし');
      return NextResponse.json({ success: true, message: 'Google連携済みユーザーなし', processed: 0 });
    }

    // カレンダースコープを持つユーザーのみフィルタ
    const calendarUsers = tokens.filter((t) => {
      const scope = (t.token_data as Record<string, string>)?.scope || '';
      return scope.includes('calendar');
    });

    console.log(`[SyncMeetingNotes] 対象ユーザー: ${calendarUsers.length}人（全トークン: ${tokens.length}件）`);

    if (calendarUsers.length === 0) {
      return NextResponse.json({ success: true, message: 'カレンダースコープ付きユーザーなし', processed: 0 });
    }

    // 過去の取得範囲: URLパラメータ hours で上書き可能（デフォルト3時間）
    // 毎時間実行のため3時間で十分（Gemini Docs添付タイムラグをカバー）
    // テスト用: ?hours=96 で過去4日分を取得
    const hoursParam = request.nextUrl.searchParams.get('hours');
    const lookbackHours = hoursParam ? parseInt(hoursParam, 10) : 3;
    const now = new Date();
    const timeMin = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + 1 * 60 * 60 * 1000).toISOString();

    // ========================================
    // 全体統計
    // ========================================
    let totalProcessed = 0;
    let totalCreated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    const allSkipReasons: { user: string; event: string; reason: string }[] = [];
    const userResults: { userId: string; events: number; created: number; skipped: number; errors: number }[] = [];

    // ========================================
    // 各ユーザーのカレンダーをスキャン
    // ========================================
    for (const token of calendarUsers) {
      const userId = token.user_id;
      let userEvents = 0;
      let userCreated = 0;
      let userSkipped = 0;
      let userErrors = 0;

      try {
        const events = await getEvents(userId, timeMin, timeMax, 'primary', 50);

        // Google Meet イベントのみフィルタ（終了済みのもの）
        const meetEvents = events.filter(e => {
          if (!isGoogleMeetEvent(e)) return false;
          const endTime = new Date(e.end);
          return endTime.getTime() < now.getTime();
        });

        userEvents = meetEvents.length;
        if (meetEvents.length === 0) {
          userResults.push({ userId, events: 0, created: 0, skipped: 0, errors: 0 });
          continue;
        }

        console.log(`[SyncMeetingNotes] ユーザー ${userId}: 終了済みMeetイベント ${meetEvents.length}件`);

        for (const event of meetEvents) {
          try {
            // 既にこのカレンダーイベントIDで取り込み済みかチェック
            // ※ 他ユーザー経由で既に取り込まれていてもスキップ（同一会議の重複防止）
            const { data: existing } = await supabase
              .from('meeting_records')
              .select('id')
              .eq('source_type', 'gemini')
              .eq('source_file_id', event.id)
              .limit(1);

            if (existing && existing.length > 0) {
              allSkipReasons.push({ user: userId, event: event.summary, reason: `既にDB登録済み (record_id=${existing[0].id})` });
              userSkipped++;
              continue;
            }

            // 会議メモを取得
            const noteResult = await fetchMeetingNoteFromEvent(userId, event);
            if (!noteResult.found || !noteResult.textContent) {
              const attachmentInfo = event.attachments?.map(a => `${a.title}(${a.mimeType})`).join(', ') || 'なし';
              allSkipReasons.push({ user: userId, event: event.summary, reason: `会議メモ未検出 (found=${noteResult.found}, hasText=${!!noteResult.textContent}, attachments=[${attachmentInfo}])` });
              userSkipped++;
              continue;
            }

            totalProcessed++;
            console.log(`[SyncMeetingNotes] 会議メモ検出: "${event.summary}" → Docs: "${noteResult.docTitle}" (user: ${userId})`);

            // プロジェクト自動判定（3段階フォールバック）
            // ① カレンダーイベントのdescriptionからproject_idを抽出（定期イベント等で埋め込み済み）
            // ② 参加者メールからcontact_channels → organization → projects
            // ③ 最新プロジェクト（最終フォールバック）
            let projectId = resolveProjectFromDescription(event.description);
            if (projectId) {
              console.log(`[SyncMeetingNotes] プロジェクト判定: description埋め込み → ${projectId}`);
            } else {
              projectId = await resolveProjectFromAttendees(supabase, noteResult.attendees);
              if (projectId) {
                console.log(`[SyncMeetingNotes] プロジェクト判定: 参加者メール → ${projectId}`);
              }
            }
            if (!projectId) {
              console.warn(`[SyncMeetingNotes] プロジェクト判定失敗: "${event.summary}" — スキップ`);
              allSkipReasons.push({ user: userId, event: event.summary, reason: 'プロジェクト判定失敗（description・参加者メールともに不一致）' });
              userSkipped++;
              continue;
            }

            // meeting_date を会議開始時刻から抽出（JST日付）
            const meetingDate = new Date(noteResult.meetingStartTime).toISOString().split('T')[0];

            // meeting_records に登録（user_idは取り込んだユーザー）
            const { data: newRecord, error: insertError } = await supabase
              .from('meeting_records')
              .insert({
                project_id: projectId,
                title: event.summary || noteResult.docTitle || '会議メモ',
                content: noteResult.textContent,
                meeting_date: meetingDate,
                source_type: 'gemini',
                source_file_id: event.id,
                meeting_start_at: noteResult.meetingStartTime,
                meeting_end_at: noteResult.meetingEndTime,
                participants: noteResult.attendees,
                metadata: {
                  gemini_doc_id: noteResult.docId,
                  gemini_doc_url: noteResult.docUrl,
                  gemini_doc_title: noteResult.docTitle,
                  calendar_event_id: event.id,
                  calendar_html_link: event.htmlLink,
                  synced_by_user_id: userId,
                },
                user_id: userId,
              })
              .select('id')
              .single();

            if (insertError) {
              console.error(`[SyncMeetingNotes] INSERT失敗:`, insertError);
              userErrors++;
              continue;
            }

            // Geminiパーサーで解析し、ai_summary を更新
            if (newRecord) {
              try {
                const analysis = parseGeminiNotes(noteResult.textContent);
                await supabase
                  .from('meeting_records')
                  .update({
                    ai_summary: analysis.summary || null,
                    processed: true,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', newRecord.id);

                // AI解析パイプラインを起動
                try {
                  await triggerAnalysisPipeline(supabase, userId, newRecord.id, noteResult.textContent, projectId, event.summary, meetingDate);
                } catch (pipelineError) {
                  console.error(`[SyncMeetingNotes] 解析パイプラインエラー:`, pipelineError);
                }
              } catch (parseError) {
                console.error(`[SyncMeetingNotes] パース失敗:`, parseError);
              }
              userCreated++;
            }
          } catch (eventError) {
            console.error(`[SyncMeetingNotes] イベント処理エラー: "${event.summary}" (user: ${userId})`, eventError);
            userErrors++;
          }
        }
      } catch (userError) {
        console.error(`[SyncMeetingNotes] ユーザー ${userId} の処理エラー:`, userError);
        userErrors++;
      }

      totalCreated += userCreated;
      totalSkipped += userSkipped;
      totalErrors += userErrors;
      userResults.push({ userId, events: userEvents, created: userCreated, skipped: userSkipped, errors: userErrors });
    }

    console.log(`[SyncMeetingNotes] 完了: users=${calendarUsers.length}, processed=${totalProcessed}, created=${totalCreated}, skipped=${totalSkipped}, errors=${totalErrors}`);

    return NextResponse.json({
      success: true,
      data: {
        users_scanned: calendarUsers.length,
        total_processed: totalProcessed,
        total_created: totalCreated,
        total_skipped: totalSkipped,
        total_errors: totalErrors,
        user_results: userResults,
        skip_reasons: allSkipReasons,
      },
    });
  } catch (error) {
    console.error('[SyncMeetingNotes] Cronエラー:', error);
    return NextResponse.json({ success: false, error: 'Cron実行エラー' }, { status: 500 });
  }
}

// ========================================
// プロジェクト自動判定①: カレンダーイベントのdescriptionからproject_id抽出
// 定期イベント（RecurringRulesManager）で作成された予定にはproject_idが埋め込まれている
// ========================================
function resolveProjectFromDescription(description?: string): string | null {
  if (!description) return null;
  // "project_id: UUID" パターンを検出
  const match = description.match(/project_id:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return match ? match[1] : null;
}

// ========================================
// プロジェクト自動判定②: 参加者メールから
// ========================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveProjectFromAttendees(supabase: any, attendees: string[]): Promise<string | null> {
  if (!attendees || attendees.length === 0) return null;

  try {
    // 参加者メール → contact_channels → contact_persons → organization → projects
    for (const email of attendees) {
      if (!email || !email.includes('@')) continue;
      // 自社メール（next-stage.biz）はスキップ
      if (email.endsWith('@next-stage.biz')) continue;

      const { data: channels } = await supabase
        .from('contact_channels')
        .select('contact_id')
        .eq('channel', 'email')
        .eq('address', email)
        .limit(1);

      if (!channels || channels.length === 0) continue;

      const { data: contact } = await supabase
        .from('contact_persons')
        .select('organization_id')
        .eq('id', channels[0].contact_id)
        .single();

      if (!contact?.organization_id) continue;

      // 組織 → プロジェクト（最新のもの）
      const { data: projects } = await supabase
        .from('projects')
        .select('id')
        .eq('organization_id', contact.organization_id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (projects && projects.length > 0) {
        return projects[0].id;
      }
    }

    // フォールバック: 最新のアクティブプロジェクト
    const { data: latestProject } = await supabase
      .from('projects')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return latestProject?.id || null;
  } catch (error) {
    console.error('[SyncMeetingNotes] プロジェクト判定エラー:', error);
    return null;
  }
}

// ========================================
// 解析パイプライン（Geminiパーサー → DB更新）
// analyze/route.ts のロジックをインラインで実行
// ========================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function triggerAnalysisPipeline(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  recordId: string,
  content: string,
  projectId: string,
  title: string,
  meetingDate: string,
): Promise<void> {
  const { parseGeminiNotes } = await import('@/services/gemini/geminiParser.service');
  const { matchContactByName } = await import('@/services/businessLog/taskSuggestion.service');
  const { ThoughtNodeService } = await import('@/services/nodemap/thoughtNode.service');
  const { processAIOpenIssues } = await import('@/services/v34/openIssues.service');
  const { processAIDecisions } = await import('@/services/v34/decisionLog.service');

  const analysisResult = parseGeminiNotes(content);

  // ai_summary 更新
  await supabase
    .from('meeting_records')
    .update({
      ai_summary: analysisResult.summary || null,
      processed: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', recordId);

  // ビジネスイベント自動登録
  try {
    const { data: existingEvent } = await supabase
      .from('business_events')
      .select('id')
      .eq('meeting_record_id', recordId)
      .limit(1)
      .single();

    if (!existingEvent) {
      await supabase.from('business_events').insert({
        user_id: userId,
        project_id: projectId,
        event_type: 'meeting',
        title: `会議: ${title}`,
        content: analysisResult.summary || title,
        event_date: meetingDate,
        meeting_record_id: recordId,
        ai_generated: true,
      });
    }
  } catch {
    // ビジネスイベント失敗してもブロックしない
  }

  // ナレッジ抽出
  try {
    await ThoughtNodeService.extractAndLinkFromText({
      text: content,
      userId,
      sourceType: 'meeting_record',
      sourceId: recordId,
      projectId,
    });
  } catch {
    // 失敗してもブロックしない
  }

  // action_items → task_suggestions
  if (analysisResult.action_items.length > 0) {
    try {
      const itemsWithContacts = await Promise.all(
        analysisResult.action_items.map(async (item) => {
          let assigneeContactId: string | null = null;
          if (item.assignee) {
            assigneeContactId = await matchContactByName(supabase, userId, item.assignee);
          }
          return {
            title: item.title,
            assignee: item.assignee || '',
            assigneeContactId,
            context: item.context || '',
            due_date: item.due_date || null,
            priority: item.priority || 'medium',
            related_topics: item.related_topics || [],
          };
        })
      );

      await supabase.from('task_suggestions').insert({
        user_id: userId,
        meeting_record_id: recordId,
        suggestions: {
          meetingTitle: title,
          meetingDate,
          projectId,
          items: itemsWithContacts,
        },
        status: 'pending',
      });
    } catch {
      // 失敗してもブロックしない
    }
  }

  // open_issues / decision_log
  try {
    if (analysisResult.new_open_issues.length > 0 || analysisResult.resolved_issues.length > 0) {
      await processAIOpenIssues(
        projectId,
        userId,
        recordId,
        analysisResult.new_open_issues,
        analysisResult.resolved_issues
      );
    }

    if (analysisResult.new_decisions.length > 0) {
      await processAIDecisions(
        projectId,
        userId,
        recordId,
        analysisResult.new_decisions
      );
    }
  } catch {
    // 失敗してもブロックしない
  }

  // 検討ツリー生成（topicsがある場合）
  if (analysisResult.topics.length > 0) {
    try {
      const baseUrl = 'https://node-map-eight.vercel.app';
      const generateUrl = `${baseUrl}/api/decision-trees/generate`;

      const treeRes = await fetch(generateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-internal': 'true',
          'x-cron-secret': process.env.CRON_SECRET || '',
        },
        body: JSON.stringify({
          project_id: projectId,
          meeting_record_id: recordId,
          topics: analysisResult.topics,
          source_type: 'meeting',
        }),
      });

      if (treeRes.ok) {
        console.log(`[SyncMeetingNotes] 検討ツリー生成完了`);
      } else {
        console.error(`[SyncMeetingNotes] 検討ツリー生成エラー: ${treeRes.status}`);
      }
    } catch (treeError) {
      console.error(`[SyncMeetingNotes] 検討ツリー生成例外:`, treeError);
    }
  }

  // v7.0: チャネル自動投稿
  try {
    const { notifyMeetingSummaryToChannels } = await import(
      '@/services/v70/meetingSummaryNotifier.service'
    );

    const actionItemsForNotify = analysisResult.action_items.map((item) => ({
      title: item.title,
      assignee: item.assignee || '',
      assigneeContactId: null as string | null,
      context: item.context || '',
      due_date: item.due_date || null,
      priority: item.priority || 'medium' as const,
    }));

    // 担当者名→contact_idのマッチング
    for (const item of actionItemsForNotify) {
      if (item.assignee) {
        try {
          const contactId = await matchContactByName(supabase, userId, item.assignee);
          item.assigneeContactId = contactId;
        } catch { /* 無視 */ }
      }
    }

    const channelResult = await notifyMeetingSummaryToChannels({
      projectId,
      meetingTitle: title,
      meetingDate,
      meetingRecordId: recordId,
      summary: analysisResult.summary || '',
      decisions: analysisResult.new_decisions || [],
      openIssues: analysisResult.new_open_issues || [],
      actionItems: actionItemsForNotify,
      userId,
    });

    if (channelResult.slackSent || channelResult.chatworkSent) {
      console.log(`[SyncMeetingNotes] チャネル通知完了: slack=${channelResult.slackSent}, chatwork=${channelResult.chatworkSent}`);
    }
  } catch (notifyError) {
    console.error(`[SyncMeetingNotes] チャネル通知エラー:`, notifyError);
  }

  console.log(`[SyncMeetingNotes] パイプライン完了: record=${recordId}, topics=${analysisResult.topics.length}, actions=${analysisResult.action_items.length}, issues=${analysisResult.new_open_issues.length}, decisions=${analysisResult.new_decisions.length}`);
}
