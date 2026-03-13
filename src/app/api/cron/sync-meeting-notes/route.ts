// v6.0 Cron: Gemini会議メモ自動取得
// スケジュール: 毎日 07:00 UTC（= JST 16:00）
// Google Calendar の過去24時間の完了済みGoogle Meet イベントから
// Gemini会議メモ（添付Google Docs）を検出し、meeting_records に自動登録

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

    // オーナーユーザーIDを取得（Cron = シングルユーザー前提）
    const ownerId = process.env.ENV_TOKEN_OWNER_ID;
    if (!ownerId) {
      console.warn('[SyncMeetingNotes] ENV_TOKEN_OWNER_ID 未設定');
      return NextResponse.json({ success: true, message: 'ENV_TOKEN_OWNER_ID未設定のためスキップ' });
    }

    // 過去48時間 + 未来1時間のイベントを取得
    // Gemini会議メモが添付されるまでタイムラグがあるため、余裕を持たせる
    const now = new Date();
    const timeMin = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + 1 * 60 * 60 * 1000).toISOString();

    const events = await getEvents(ownerId, timeMin, timeMax, 'primary', 50);
    console.log(`[SyncMeetingNotes] カレンダーイベント取得: ${events.length}件`);

    // Google Meet イベントのみフィルタ（終了済みのもの）
    const meetEvents = events.filter(e => {
      if (!isGoogleMeetEvent(e)) return false;
      // 終了時刻が現在より前（= 会議終了済み）
      const endTime = new Date(e.end);
      return endTime.getTime() < now.getTime();
    });

    console.log(`[SyncMeetingNotes] 終了済みMeetイベント: ${meetEvents.length}件`);

    let processed = 0;
    let skipped = 0;
    let created = 0;
    let errors = 0;
    const skipReasons: { event: string; reason: string }[] = [];

    for (const event of meetEvents) {
      try {
        console.log(`[SyncMeetingNotes] 処理中: "${event.summary}" (id=${event.id}, attachments=${event.attachments?.length || 0})`);

        // 既にこのカレンダーイベントIDで取り込み済みかチェック
        const { data: existing } = await supabase
          .from('meeting_records')
          .select('id')
          .eq('source_type', 'gemini')
          .eq('source_file_id', event.id) // source_file_id にカレンダーイベントIDを保存
          .limit(1);

        if (existing && existing.length > 0) {
          skipReasons.push({ event: event.summary, reason: `既にDB登録済み (record_id=${existing[0].id})` });
          skipped++;
          continue;
        }

        // 会議メモを取得
        const noteResult = await fetchMeetingNoteFromEvent(ownerId, event);
        if (!noteResult.found || !noteResult.textContent) {
          const attachmentInfo = event.attachments?.map(a => `${a.title}(${a.mimeType})`).join(', ') || 'なし';
          skipReasons.push({ event: event.summary, reason: `会議メモ未検出 (found=${noteResult.found}, hasText=${!!noteResult.textContent}, attachments=[${attachmentInfo}])` });
          skipped++;
          continue;
        }

        processed++;
        console.log(`[SyncMeetingNotes] 会議メモ検出: "${event.summary}" → Docs: "${noteResult.docTitle}"`);

        // 参加者メールからプロジェクトを自動判定
        const projectId = await resolveProjectFromAttendees(supabase, noteResult.attendees);
        if (!projectId) {
          console.warn(`[SyncMeetingNotes] プロジェクト判定失敗: "${event.summary}" — スキップ`);
          skipped++;
          continue;
        }

        // meeting_date を会議開始時刻から抽出（JST日付）
        const meetingDate = new Date(noteResult.meetingStartTime).toISOString().split('T')[0];

        // meeting_records に登録
        const { data: newRecord, error: insertError } = await supabase
          .from('meeting_records')
          .insert({
            project_id: projectId,
            title: event.summary || noteResult.docTitle || '会議メモ',
            content: noteResult.textContent,
            meeting_date: meetingDate,
            source_type: 'gemini',
            source_file_id: event.id, // カレンダーイベントIDで重複防止
            meeting_start_at: noteResult.meetingStartTime,
            meeting_end_at: noteResult.meetingEndTime,
            participants: noteResult.attendees,
            metadata: {
              gemini_doc_id: noteResult.docId,
              gemini_doc_url: noteResult.docUrl,
              gemini_doc_title: noteResult.docTitle,
              calendar_event_id: event.id,
              calendar_html_link: event.htmlLink,
            },
            user_id: ownerId,
          })
          .select('id')
          .single();

        if (insertError) {
          console.error(`[SyncMeetingNotes] INSERT失敗:`, insertError);
          errors++;
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

            // AI解析パイプラインを起動（ビジネスイベント・タスク提案・検討ツリー等）
            // analyze APIを内部呼び出し
            const analyzeUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL ? '' : 'http://localhost:3000'}/api/meeting-records/${newRecord.id}/analyze`;
            try {
              // Note: 本番ではVercel internal URL or fetch で呼び出し
              // ここではanalyze APIのロジックを直接実行する方がベター
              await triggerAnalysisPipeline(supabase, ownerId, newRecord.id, noteResult.textContent, projectId, event.summary, meetingDate);
            } catch (pipelineError) {
              // パイプライン失敗しても会議録自体は保存済みなので続行
              console.error(`[SyncMeetingNotes] 解析パイプラインエラー:`, pipelineError);
            }
          } catch (parseError) {
            console.error(`[SyncMeetingNotes] パース失敗:`, parseError);
          }
          created++;
        }
      } catch (eventError) {
        console.error(`[SyncMeetingNotes] イベント処理エラー: "${event.summary}"`, eventError);
        errors++;
      }
    }

    console.log(`[SyncMeetingNotes] 完了: processed=${processed}, created=${created}, skipped=${skipped}, errors=${errors}`);

    return NextResponse.json({
      success: true,
      data: {
        total_events: events.length,
        meet_events: meetEvents.length,
        meet_event_details: meetEvents.map(e => ({
          summary: e.summary,
          id: e.id,
          start: e.start,
          end: e.end,
          attachments: e.attachments?.map(a => ({ title: a.title, mimeType: a.mimeType, fileId: a.fileId })) || [],
        })),
        processed,
        created,
        skipped,
        skip_reasons: skipReasons,
        errors,
      },
    });
  } catch (error) {
    console.error('[SyncMeetingNotes] Cronエラー:', error);
    return NextResponse.json({ success: false, error: 'Cron実行エラー' }, { status: 500 });
  }
}

// ========================================
// プロジェクト自動判定（参加者メールから）
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
