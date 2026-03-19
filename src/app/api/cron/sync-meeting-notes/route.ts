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

            // プロジェクト自動判定（4段階フォールバック）
            // ① カレンダーイベントのdescriptionからproject_idを抽出（定期イベント等で埋め込み済み）
            // ②  [NM-Meeting] タイトルからproject_recurring_rulesを逆引き
            // ③ 参加者メールからcontact_channels → organization → projects
            // ④ 最新プロジェクト（最終フォールバック）
            let projectId = resolveProjectFromDescription(event.description);
            if (projectId) {
              console.log(`[SyncMeetingNotes] プロジェクト判定: description埋め込み → ${projectId}`);
            }

            // ② [NM-Meeting] タイトルからrecurring_rulesを逆引き
            let matchedRecurringRuleId: string | null = null;
            if (!projectId && event.summary) {
              const ruleMatch = await resolveProjectFromRecurringRules(supabase, event.summary);
              if (ruleMatch) {
                projectId = ruleMatch.projectId;
                matchedRecurringRuleId = ruleMatch.ruleId;
                console.log(`[SyncMeetingNotes] プロジェクト判定: recurring_rules逆引き → PJ ${projectId}, rule ${matchedRecurringRuleId}`);
              }
            }
            // ①のdescription埋め込み経由でもrecurring_rule_idを解決
            if (projectId && !matchedRecurringRuleId && event.summary) {
              const ruleMatch = await resolveProjectFromRecurringRules(supabase, event.summary);
              if (ruleMatch && ruleMatch.projectId === projectId) {
                matchedRecurringRuleId = ruleMatch.ruleId;
              }
            }

            // ③ 参加者メールから
            if (!projectId) {
              projectId = await resolveProjectFromAttendees(supabase, noteResult.attendees);
              if (projectId) {
                console.log(`[SyncMeetingNotes] プロジェクト判定: 参加者メール → ${projectId}`);
              }
            }

            // ④ 最終フォールバック: 最新プロジェクト
            if (!projectId) {
              projectId = await resolveLatestProject(supabase);
              if (projectId) {
                console.log(`[SyncMeetingNotes] プロジェクト判定: 最新PJフォールバック → ${projectId}`);
              }
            }

            if (!projectId) {
              console.warn(`[SyncMeetingNotes] プロジェクト判定失敗: "${event.summary}" (desc=${event.description?.substring(0, 100) || 'なし'}, attendees=${noteResult.attendees?.length || 0}人) — スキップ`);
              allSkipReasons.push({ user: userId, event: event.summary, reason: 'プロジェクト判定失敗（全4経路で不一致）' });
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
                recurring_rule_id: matchedRecurringRuleId || null,
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

            // 統一パイプライン: analyze API を呼び出し
            // Claude AI解析 → 検討ツリー生成 → チャネル通知を一括実行
            if (newRecord) {
              try {
                const cronSecret = process.env.CRON_SECRET || '';
                const analyzeUrl = `https://node-map-eight.vercel.app/api/meeting-records/${newRecord.id}/analyze?cron_secret=${encodeURIComponent(cronSecret)}`;
                console.log(`[SyncMeetingNotes] analyze API呼び出し: recordId=${newRecord.id}`);
                const analyzeRes = await fetch(analyzeUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-cron-secret': cronSecret,
                  },
                  body: JSON.stringify({ user_id: userId }),
                });
                if (analyzeRes.ok) {
                  const analyzeData = await analyzeRes.json();
                  console.log(`[SyncMeetingNotes] analyze完了: topics=${analyzeData.data?.analysis?.topics?.length || 0}, actions=${analyzeData.data?.analysis?.action_items?.length || 0}`);
                } else {
                  console.error(`[SyncMeetingNotes] analyze APIエラー: ${analyzeRes.status} ${await analyzeRes.text().catch(() => '')}`);
                }
              } catch (pipelineError) {
                console.error(`[SyncMeetingNotes] 解析パイプラインエラー:`, pipelineError);
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
// プロジェクト自動判定②: [NM-Meeting] タイトルからrecurring_rulesを逆引き
// ========================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveProjectFromRecurringRules(supabase: any, eventSummary: string): Promise<{ projectId: string; ruleId: string } | null> {
  try {
    // [NM-Meeting] プレフィックスを除去してタイトルを取得
    const titleMatch = eventSummary.match(/\[NM-Meeting\]\s*(.+)/);
    if (!titleMatch) return null;
    const ruleTitle = titleMatch[1].trim();

    // recurring_rules から部分一致で検索（タイトルに日付等が付く場合があるため）
    const { data: rules } = await supabase
      .from('project_recurring_rules')
      .select('id, project_id, title')
      .eq('type', 'meeting')
      .eq('enabled', true);

    if (!rules || rules.length === 0) return null;

    // タイトルの前方一致 or 含有でマッチ
    for (const rule of rules) {
      if (ruleTitle.startsWith(rule.title) || rule.title.startsWith(ruleTitle) || ruleTitle.includes(rule.title)) {
        return { projectId: rule.project_id, ruleId: rule.id };
      }
    }

    return null;
  } catch (error) {
    console.error('[SyncMeetingNotes] recurring_rules逆引きエラー:', error);
    return null;
  }
}

// ========================================
// プロジェクト自動判定③: 参加者メールから
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

    return null;
  } catch (error) {
    console.error('[SyncMeetingNotes] 参加者メール判定エラー:', error);
    return null;
  }
}

// ========================================
// プロジェクト自動判定④: 最終フォールバック（最新プロジェクト）
// ========================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveLatestProject(supabase: any): Promise<string | null> {
  try {
    const { data: latestProject } = await supabase
      .from('projects')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return latestProject?.id || null;
  } catch (error) {
    console.error('[SyncMeetingNotes] 最新PJフォールバックエラー:', error);
    return null;
  }
}

