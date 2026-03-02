// Phase B拡張: 秘書AI会話API（意図分類 + インラインカード生成 + 返信下書き + ジョブ自律実行 + カレンダー連携）
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { createServerClient, isSupabaseConfigured, getServerSupabase, getSupabase } from '@/lib/supabase';
import { generateReplyDraft } from '@/services/ai/aiClient.service';
import {
  getTodayEvents,
  findFreeSlots,
  formatEventsForContext,
  formatFreeSlotsForContext,
  isCalendarConnected,
} from '@/services/calendar/calendarClient.service';
import type { CalendarEvent } from '@/services/calendar/calendarClient.service';
import type { UnifiedMessage } from '@/lib/types';

export const dynamic = 'force-dynamic';

// ========================================
// 型定義
// ========================================
interface CardData {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

// DB行の型
interface MessageRow {
  id: string;
  channel: string;
  from_name: string;
  from_address: string;
  subject: string | null;
  body: string;
  is_read: boolean;
  direction: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  phase: string;
  due_date: string | null;
  updated_at: string;
  project_id: string | null;
}

interface JobRow {
  id: string;
  title: string;
  status: string;
  type: string | null;
  due_date: string | null;
  description: string | null;
  ai_draft: string | null;
  created_at: string;
}

// ========================================
// 意図分類（キーワードベース — 高速）
// ========================================
type Intent =
  | 'briefing'        // 今日の状況
  | 'inbox'           // メッセージ一覧
  | 'message_detail'  // 特定メッセージ
  | 'reply_draft'     // 返信下書き生成
  | 'create_job'      // ジョブ作成（AIに任せる）
  | 'calendar'        // カレンダー・予定確認
  | 'schedule'        // 日程調整・空き時間
  | 'tasks'           // タスク状況
  | 'jobs'            // ジョブ・対応必要
  | 'documents'       // ドキュメント・ファイル一覧
  | 'file_intake'     // ファイル確認・承認フロー
  | 'store_file'      // ファイル格納指示
  | 'share_file'      // ファイル共有
  | 'thought_map'     // 思考マップ
  | 'business_log'    // ビジネスログ
  | 'business_summary' // 活動要約・週間レポート
  | 'create_business_event' // ビジネスイベント登録
  | 'general';        // その他

function classifyIntent(message: string): Intent {
  const m = message.toLowerCase();

  // ジョブ作成（「〇〇しておいて」「任せる」「代わりにやって」）— 返信下書きより先に判定
  if ((m.includes('しておいて') || m.includes('しといて') || m.includes('お願い') || m.includes('やっておいて') || m.includes('やっといて'))
    && (m.includes('返信') || m.includes('返事') || m.includes('お礼') || m.includes('確認') || m.includes('日程') || m.includes('連絡'))) {
    return 'create_job';
  }
  if (m.includes('任せ') || m.includes('代わりに') || m.includes('おまかせ') || m.includes('自動で')) return 'create_job';
  if (m.includes('ジョブにして') || m.includes('ジョブとして')) return 'create_job';

  // 日程調整（空き時間検索を含む）
  if (m.includes('日程') && (m.includes('調整') || m.includes('候補') || m.includes('提案'))) return 'schedule';
  if (m.includes('空') && (m.includes('時間') || m.includes('き') || m.includes('いてる'))) return 'schedule';
  if (m.includes('いつ空') || m.includes('打ち合わせ') && m.includes('いつ')) return 'schedule';

  // カレンダー・予定確認
  if (m.includes('予定') || m.includes('スケジュール') || m.includes('カレンダー')) return 'calendar';
  if (m.includes('今日') && m.includes('予定')) return 'calendar';
  if (m.includes('今週') && (m.includes('予定') || m.includes('スケジュール'))) return 'calendar';

  // 返信下書き（優先度高め）
  if (m.includes('返信') && (m.includes('下書き') || m.includes('作って') || m.includes('書いて'))) return 'reply_draft';
  if (m.includes('返信して') || (m.includes('返事') && (m.includes('書') || m.includes('作')))) return 'reply_draft';

  // ブリーフィング
  if (m.includes('今日') && (m.includes('状況') || m.includes('教えて'))) return 'briefing';
  if (m.includes('おはよう') || m.includes('ブリーフィング') || m.includes('報告')) return 'briefing';

  // メッセージ
  if (m.includes('メッセージ') || m.includes('メール') || m.includes('新着') || m.includes('受信')) return 'inbox';
  if (m.includes('誰から') || m.includes('連絡')) return 'inbox';

  // タスク
  if (m.includes('タスク') || m.includes('進行') || m.includes('やること') || m.includes('期限')) return 'tasks';

  // ジョブ一覧
  if (m.includes('ジョブ') || (m.includes('対応') && m.includes('必要'))) return 'jobs';
  if (m.includes('対応が必要') || m.includes('やるべき')) return 'jobs';

  // ファイル格納指示（「格納して」「保存して」「入れて」+ URL検出）
  if (m.includes('格納') || (m.includes('保存') && (m.includes('ドライブ') || m.includes('フォルダ')))) return 'store_file';
  if ((m.includes('入れて') || m.includes('入れといて')) && (m.includes('フォルダ') || m.includes('ドライブ'))) return 'store_file';
  // URLが含まれている場合の格納指示
  if ((m.includes('格納') || m.includes('保存して')) && (m.includes('http') || m.includes('docs.google') || m.includes('sheets.google') || m.includes('drive.google'))) return 'store_file';

  // ファイル確認・承認（受領ファイルの確認フロー）
  if (m.includes('ファイル') && (m.includes('確認') || m.includes('承認') || m.includes('チェック'))) return 'file_intake';
  if (m.includes('届いた') && (m.includes('書類') || m.includes('ファイル') || m.includes('資料'))) return 'file_intake';
  if (m.includes('受け取った') && (m.includes('ファイル') || m.includes('書類'))) return 'file_intake';
  if (m.includes('未確認') && (m.includes('ファイル') || m.includes('書類'))) return 'file_intake';
  if (m.includes('取り込み') || m.includes('インテーク')) return 'file_intake';

  // ドキュメント・ファイル（Drive）
  if (m.includes('共有') && (m.includes('ファイル') || m.includes('資料') || m.includes('ドキュメント') || m.includes('ドライブ'))) return 'share_file';
  if (m.includes('ドライブ') || m.includes('google drive') || m.includes('drive')) return 'documents';
  if (m.includes('ファイル') || m.includes('資料') || m.includes('ドキュメント') || m.includes('書類')) return 'documents';
  if (m.includes('添付') && (m.includes('一覧') || m.includes('見') || m.includes('検索'))) return 'documents';

  // 思考マップ
  if (m.includes('思考') || m.includes('マップ') || m.includes('ナレッジ')) return 'thought_map';

  // ビジネスイベント登録（自然言語で幅広くマッチ）
  // 「打ち合わせを記録して」「会議を登録」「ビジネスメモを追加」「活動を残したい」等
  if ((m.includes('記録') || m.includes('登録') || m.includes('追加')) && (m.includes('打ち合わせ') || m.includes('会議') || m.includes('電話') || m.includes('商談'))) return 'create_business_event';
  if (m.includes('イベント') && (m.includes('記録') || m.includes('追加') || m.includes('登録') || m.includes('作成'))) return 'create_business_event';
  if ((m.includes('記録') || m.includes('登録') || m.includes('追加') || m.includes('残')) && (m.includes('活動') || m.includes('ビジネス'))) return 'create_business_event';
  if (m.includes('ログ') && (m.includes('残') || m.includes('追加') || m.includes('記録') || m.includes('書'))) return 'create_business_event';
  // 「ビジネスメモ」「活動メモ」「メモを追加」等のパターン
  if ((m.includes('ビジネス') || m.includes('活動') || m.includes('業務')) && (m.includes('メモ') || m.includes('ノート'))) return 'create_business_event';
  if (m.includes('メモ') && (m.includes('追加') || m.includes('記録') || m.includes('登録') || m.includes('残'))) return 'create_business_event';
  // 「〜したい」「〜を残す」系の自然な表現
  if ((m.includes('記録したい') || m.includes('残したい') || m.includes('追加したい') || m.includes('登録したい')) && !m.includes('タスク') && !m.includes('ジョブ')) return 'create_business_event';
  // 「打ち合わせがあった」「会議した」「電話した」等の報告系
  if ((m.includes('打ち合わせ') || m.includes('会議') || m.includes('商談')) && (m.includes('あった') || m.includes('した') || m.includes('終わった') || m.includes('だった'))) return 'create_business_event';

  // ビジネス活動要約
  if (m.includes('活動') && (m.includes('要約') || m.includes('まとめ') || m.includes('サマリー'))) return 'business_summary';
  if (m.includes('週間') && (m.includes('レポート') || m.includes('報告') || m.includes('要約'))) return 'business_summary';
  if (m.includes('プロジェクト') && (m.includes('状況') || m.includes('進捗') || m.includes('サマリー'))) return 'business_summary';

  // ビジネスログ
  if (m.includes('ログ') || m.includes('ビジネス') || m.includes('活動')) return 'business_log';

  return 'general';
}

// ========================================
// 実データ取得 + カード生成
// ========================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

interface ContextAndCards {
  contextText: string;
  cards: CardData[];
  rawData: {
    messages: MessageRow[];
    tasks: TaskRow[];
    jobs: JobRow[];
  };
}

async function fetchDataAndBuildCards(
  supabase: SupabaseClient,
  userId: string,
  intent: Intent,
  userMessage: string
): Promise<ContextAndCards> {
  const cards: CardData[] = [];
  const parts: string[] = [];
  let messages: MessageRow[] = [];
  let tasks: TaskRow[] = [];
  let jobs: JobRow[] = [];

  try {
    // 全意図で基本データは取得（コンテキスト用）
    const fetches: Promise<void>[] = [];

    // メッセージ取得
    if (['briefing', 'inbox', 'message_detail', 'reply_draft', 'create_job', 'general'].includes(intent)) {
      fetches.push(
        supabase
          .from('inbox_messages')
          .select('id, channel, from_name, from_address, subject, body, is_read, direction, created_at, metadata')
          .eq('direction', 'received')
          .order('created_at', { ascending: false })
          .limit(20)
          .then((res: { data: MessageRow[] | null }) => { messages = res.data || []; })
      );
    }

    // タスク取得
    if (['briefing', 'tasks', 'jobs', 'general'].includes(intent)) {
      fetches.push(
        supabase
          .from('tasks')
          .select('id, title, status, priority, phase, due_date, updated_at, project_id')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(20)
          .then((res: { data: TaskRow[] | null }) => { tasks = res.data || []; })
      );
    }

    // ジョブ取得
    if (['briefing', 'jobs', 'create_job', 'general'].includes(intent)) {
      fetches.push(
        supabase
          .from('jobs')
          .select('id, title, status, type, due_date, description, ai_draft, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(15)
          .then((res: { data: JobRow[] | null }) => { jobs = res.data || []; })
      );
    }

    await Promise.all(fetches);

    // ---- カード生成 ----

    // ブリーフィング → カレンダー予定取得 + サマリーカード + カレンダーカード + 期限アラート
    let calendarEvents: CalendarEvent[] = [];
    if (intent === 'briefing') {
      // カレンダー予定を取得（Google Calendar API実データのみ）
      try {
        const calConnected = await isCalendarConnected(userId);
        console.log('[Secretary API] ブリーフィング カレンダー接続:', calConnected);
        if (calConnected) {
          calendarEvents = await getTodayEvents(userId);
          console.log('[Secretary API] ブリーフィング 取得予定:', calendarEvents.length, '件',
            calendarEvents.map(e => ({ id: e.id, summary: e.summary, start: e.start })));
        }
      } catch (calErr) {
        console.error('[Secretary API] ブリーフィング カレンダー取得エラー:', calErr);
        calendarEvents = []; // エラー時は空配列を明示（捏造防止）
      }

      // (1) ブリーフィングサマリーカード
      const unreadCount = messages.filter(m => !m.is_read).length;
      const urgentCount = messages.filter(m => !m.is_read && determineUrgency(m) === 'high').length;
      const activeTaskCount = tasks.filter(t => t.status !== 'done').length;
      const pendingJobCount = jobs.filter(j => j.status === 'pending' || j.status === 'draft').length;

      // 未確認ファイル数を取得
      let pendingFileCount = 0;
      try {
        const { getPendingStagingFiles } = await import('@/services/drive/driveClient.service');
        const stagingFiles = await getPendingStagingFiles(userId);
        pendingFileCount = stagingFiles.length;
      } catch {
        // エラー時は0のまま
      }

      // 次の予定を計算
      let nextEvent: { title: string; time: string; minutesUntil?: number } | undefined;
      const now = new Date();
      const upcoming = calendarEvents
        .filter(e => !e.isAllDay && new Date(e.start) > now)
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      if (upcoming.length > 0) {
        const next = upcoming[0];
        const startDate = new Date(next.start);
        const endDate = new Date(next.end);
        const minutesUntil = Math.round((startDate.getTime() - now.getTime()) / 60000);
        nextEvent = {
          title: next.summary,
          time: `${startDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}〜${endDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`,
          minutesUntil: minutesUntil > 0 ? minutesUntil : undefined,
        };
      }

      cards.push({
        type: 'briefing_summary',
        data: {
          date: now.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }),
          unreadCount,
          urgentCount,
          activeTaskCount,
          pendingJobCount,
          todayEventCount: calendarEvents.length,
          pendingFileCount,
          nextEvent,
        },
      });

      // (2) カレンダー予定カード（予定がある場合）
      if (calendarEvents.length > 0) {
        cards.push({
          type: 'calendar_events',
          data: {
            date: '今日',
            events: calendarEvents.map(ev => {
              const startDate = new Date(ev.start);
              const endDate = new Date(ev.end);
              const isNow = !ev.isAllDay && startDate <= now && endDate > now;
              return {
                id: ev.id,
                title: ev.summary,
                startTime: ev.isAllDay ? '' : startDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
                endTime: ev.isAllDay ? '' : endDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
                location: ev.location,
                isAllDay: ev.isAllDay,
                isNow,
              };
            }),
          },
        });
      }

      // (3) 期限アラートカード（今日〜3日以内に期限のタスク/ジョブ）
      const deadlineItems: Array<{
        id: string; title: string; dueDate: string; dueLabel: string;
        priority: string; type: 'task' | 'job'; urgency: 'overdue' | 'today' | 'soon';
      }> = [];

      const todayStr = now.toISOString().split('T')[0];
      const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      for (const t of tasks.filter(tk => tk.status !== 'done' && tk.due_date)) {
        const due = t.due_date!;
        if (due <= threeDaysLater) {
          let urgency: 'overdue' | 'today' | 'soon' = 'soon';
          let dueLabel = '';
          if (due < todayStr) { urgency = 'overdue'; dueLabel = '期限切れ'; }
          else if (due === todayStr) { urgency = 'today'; dueLabel = '今日'; }
          else {
            const diffDays = Math.ceil((new Date(due).getTime() - now.getTime()) / 86400000);
            dueLabel = diffDays === 1 ? '明日' : `${diffDays}日後`;
          }
          deadlineItems.push({
            id: t.id, title: t.title, dueDate: due, dueLabel,
            priority: t.priority, type: 'task', urgency,
          });
        }
      }

      for (const j of jobs.filter(jb => (jb.status === 'pending' || jb.status === 'draft') && jb.due_date)) {
        const due = j.due_date!;
        if (due <= threeDaysLater) {
          let urgency: 'overdue' | 'today' | 'soon' = 'soon';
          let dueLabel = '';
          if (due < todayStr) { urgency = 'overdue'; dueLabel = '期限切れ'; }
          else if (due === todayStr) { urgency = 'today'; dueLabel = '今日'; }
          else {
            const diffDays = Math.ceil((new Date(due).getTime() - now.getTime()) / 86400000);
            dueLabel = diffDays === 1 ? '明日' : `${diffDays}日後`;
          }
          deadlineItems.push({
            id: j.id, title: j.title, dueDate: due, dueLabel,
            priority: 'medium', type: 'job', urgency,
          });
        }
      }

      if (deadlineItems.length > 0) {
        cards.push({
          type: 'deadline_alert',
          data: { items: deadlineItems },
        });
      }
    }

    // ブリーフィング or メッセージ一覧 → InboxSummaryCard
    if ((intent === 'briefing' || intent === 'inbox') && messages.length > 0) {
      const unreadMessages = messages.filter(m => !m.is_read);
      const targetMessages = intent === 'inbox' ? messages.slice(0, 10) : unreadMessages.slice(0, 8);

      if (targetMessages.length > 0) {
        cards.push({
          type: 'inbox_summary',
          data: {
            items: targetMessages.map(m => ({
              id: m.id,
              channel: m.channel,
              from: m.from_name || m.from_address || '不明',
              subject: m.subject || undefined,
              preview: (m.body || '').replace(/\n/g, ' ').slice(0, 80),
              urgency: determineUrgency(m),
              timestamp: formatRelativeTime(m.created_at),
            })),
          },
        });
      }
    }

    // ブリーフィング or タスク → TaskResumeCard（進行中タスク）
    if ((intent === 'briefing' || intent === 'tasks') && tasks.length > 0) {
      const activeTasks = tasks.filter(t => t.status !== 'done');
      const urgentTasks = activeTasks
        .sort((a, b) => {
          const prio = { high: 0, medium: 1, low: 2 };
          return (prio[a.priority as keyof typeof prio] ?? 2) - (prio[b.priority as keyof typeof prio] ?? 2);
        })
        .slice(0, intent === 'briefing' ? 3 : 6);

      for (const t of urgentTasks) {
        cards.push({
          type: 'task_resume',
          data: {
            id: t.id,
            title: t.title,
            status: t.status,
            lastActivity: formatRelativeTime(t.updated_at),
            remainingItems: t.due_date
              ? [`期限: ${t.due_date}`, `フェーズ: ${phaseLabel(t.phase)}`, `優先度: ${priorityLabel(t.priority)}`]
              : [`フェーズ: ${phaseLabel(t.phase)}`, `優先度: ${priorityLabel(t.priority)}`],
          },
        });
      }
    }

    // ジョブ → 未処理ジョブの承認カード or 一覧
    if ((intent === 'briefing' || intent === 'jobs') && jobs.length > 0) {
      const pendingJobs = jobs.filter(j => j.status === 'pending' || j.status === 'draft');
      for (const j of pendingJobs.slice(0, intent === 'briefing' ? 2 : 5)) {
        cards.push({
          type: 'job_approval',
          data: {
            id: j.id,
            title: j.title,
            type: j.type || 'other',
            draft: j.ai_draft || j.description || '（詳細なし）',
            targetName: undefined,
          },
        });
      }
    }

    // ファイル確認 → file_intake カード（pending_review のステージングファイル）
    if (intent === 'file_intake' || intent === 'briefing') {
      try {
        const { getPendingStagingFiles, formatStagingForContext } = await import('@/services/drive/driveClient.service');
        const stagingFiles = await getPendingStagingFiles(userId);
        if (stagingFiles.length > 0) {
          cards.push({
            type: 'file_intake',
            data: {
              files: stagingFiles.map((f: Record<string, unknown>) => ({
                id: f.id,
                fileName: f.file_name,
                mimeType: f.mime_type,
                fileSizeBytes: f.file_size_bytes,
                organizationId: f.organization_id,
                projectId: f.project_id,
                aiDocumentType: f.ai_document_type || 'その他',
                aiDirection: f.ai_direction || 'received',
                aiYearMonth: f.ai_year_month || new Date().toISOString().slice(0, 7),
                aiSuggestedName: f.ai_suggested_name || f.file_name,
                aiConfidence: f.ai_confidence || 0,
                sourceType: f.source_type,
                createdAt: f.created_at,
              })),
              totalCount: stagingFiles.length,
            },
          });
          parts.push(`\n\n【未確認ファイル（${stagingFiles.length}件）】\n${formatStagingForContext(stagingFiles)}`);
        } else if (intent === 'file_intake') {
          parts.push('\n\n【未確認ファイル】\n確認待ちのファイルはありません');
        }
      } catch (intakeError) {
        console.error('[Secretary API] ステージングファイル取得エラー:', intakeError);
        if (intent === 'file_intake') {
          parts.push('\n\n【未確認ファイル】\nファイル情報の取得に失敗しました');
        }
      }
    }

    // ドキュメント・ファイル一覧 → document_list カード
    if (intent === 'documents' || intent === 'share_file') {
      try {
        const { getDocuments, formatDocumentsForContext } = await import('@/services/drive/driveClient.service');
        const docs = await getDocuments({ userId, limit: 20 });
        if (docs.length > 0) {
          cards.push({
            type: 'document_list',
            data: {
              documents: docs.map((d: Record<string, unknown>) => ({
                id: d.id,
                fileName: d.file_name,
                fileSizeBytes: d.file_size_bytes,
                mimeType: d.mime_type,
                driveUrl: d.drive_url,
                sourceChannel: d.source_channel,
                uploadedAt: d.uploaded_at,
                isShared: d.is_shared,
                organizationId: d.organization_id,
                projectId: d.project_id,
              })),
              totalCount: docs.length,
            },
          });
          parts.push(`\n\n【ドキュメント（${docs.length}件）】\n${formatDocumentsForContext(docs)}`);
        } else {
          parts.push('\n\n【ドキュメント】\nGoogle Driveに保存されたドキュメントはまだありません');
        }
      } catch (docError) {
        console.error('[Secretary API] ドキュメント取得エラー:', docError);
        parts.push('\n\n【ドキュメント】\nドキュメント情報の取得に失敗しました');
      }
    }

    // ファイル格納指示 → StorageConfirmationCard
    if (intent === 'store_file') {
      try {
        const { extractUrlsFromText } = await import('@/services/drive/driveClient.service');
        const urls = extractUrlsFromText(userMessage);

        // 組織/プロジェクト一覧を取得（選択肢として）
        const { data: orgs } = await supabase
          .from('organizations')
          .select('id, name')
          .order('name');
        const { data: projects } = await supabase
          .from('projects')
          .select('id, name, organization_id')
          .eq('user_id', userId)
          .order('name');

        cards.push({
          type: 'storage_confirmation',
          data: {
            urls: urls.length > 0 ? urls : [{ url: '', linkType: 'drive', documentId: '', title: '' }],
            rawMessage: userMessage,
            organizations: (orgs || []).map((o: { id: string; name: string }) => ({ id: o.id, name: o.name })),
            projects: (projects || []).map((p: { id: string; name: string; organization_id: string }) => ({
              id: p.id, name: p.name, organizationId: p.organization_id,
            })),
          },
        });

        if (urls.length > 0) {
          parts.push(`\n\n【検出されたURL（${urls.length}件）】\n${urls.map(u => `- ${u.url} (${u.linkType})`).join('\n')}`);
        } else {
          parts.push('\n\n【格納指示】\nURLが検出できませんでした。URLを含めて再度お伝えください。');
        }
      } catch (storeError) {
        console.error('[Secretary API] 格納指示処理エラー:', storeError);
        parts.push('\n\n【格納指示】\n処理中にエラーが発生しました');
      }
    }

    // ビジネス活動要約 → BusinessSummaryCard
    if (intent === 'business_summary') {
      try {
        const { data: summaryEvents } = await supabase
          .from('business_events')
          .select('id, project_id, event_type, title, content, event_date, summary_period, ai_generated')
          .eq('user_id', userId)
          .eq('event_type', 'summary')
          .eq('ai_generated', true)
          .order('event_date', { ascending: false })
          .limit(3);

        if (summaryEvents && summaryEvents.length > 0) {
          // プロジェクト情報を取得
          const projectIds = [...new Set(summaryEvents.map((e: { project_id: string }) => e.project_id).filter(Boolean))];
          let projectMap: Record<string, string> = {};
          if (projectIds.length > 0) {
            const { data: projData } = await supabase
              .from('projects')
              .select('id, name')
              .in('id', projectIds);
            if (projData) {
              projectMap = Object.fromEntries(projData.map((p: { id: string; name: string }) => [p.id, p.name]));
            }
          }

          cards.push({
            type: 'business_summary',
            data: {
              summaries: summaryEvents.map((e: Record<string, unknown>) => ({
                id: e.id,
                projectId: e.project_id,
                projectName: projectMap[e.project_id as string] || '全体',
                period: e.summary_period || '',
                content: e.content || '',
                eventDate: e.event_date,
              })),
            },
          });
          parts.push(`\n\n【活動要約（${summaryEvents.length}件）】\n最新の活動要約が見つかりました`);
        } else {
          // 要約がない場合は直近のビジネスイベントをカウント
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const { count } = await supabase
            .from('business_events')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('event_date', weekAgo);

          parts.push(`\n\n【活動要約】\nまだAI要約が生成されていません。直近1週間のビジネスイベントは${count || 0}件あります。毎週月曜日にAI要約が自動生成されます。`);
        }
      } catch (summaryError) {
        console.error('[Secretary API] 活動要約取得エラー:', summaryError);
        parts.push('\n\n【活動要約】\n要約の取得に失敗しました');
      }
    }

    // 思考マップ → NavigateCard
    if (intent === 'thought_map') {
      cards.push({
        type: 'navigate',
        data: {
          href: '/thought-map',
          label: '思考マップを開く',
          description: 'ナレッジノードの全体地図と思考の流れを可視化',
        },
      });
    }

    // ビジネスログ → NavigateCard
    if (intent === 'business_log') {
      cards.push({
        type: 'navigate',
        data: {
          href: '/business-log',
          label: 'ビジネスログを開く',
          description: 'プロジェクトごとの活動履歴を閲覧',
        },
      });
    }

    // カレンダー → 今日の予定 or 空き時間
    if (intent === 'calendar' || intent === 'schedule' || intent === 'briefing') {
      try {
        const calConnected = await isCalendarConnected(userId);
        console.log('[Secretary API] カレンダー接続状態:', calConnected, 'userId:', userId);
        if (calConnected) {
          if (intent === 'calendar' || intent === 'briefing') {
            // ブリーフィング時は既に calendarEvents を取得済み
            const todayEvents = intent === 'briefing' && calendarEvents.length > 0
              ? calendarEvents
              : await getTodayEvents(userId);
            console.log('[Secretary API] 取得した予定件数:', todayEvents.length, '予定ID一覧:', todayEvents.map(e => e.id));
            if (todayEvents.length > 0) {
              parts.push(`\n\n【今日の予定（Google Calendar APIから取得、${todayEvents.length}件）- この情報は実際のGoogleカレンダーから取得した確定データです】\n${formatEventsForContext(todayEvents)}`);
            } else {
              parts.push('\n\n【今日の予定（Google Calendar APIから取得）】\n予定なし（Googleカレンダーに本日の予定は登録されていません）');
            }
          }
          if (intent === 'schedule') {
            // 来週の空き時間を検索
            const now = new Date();
            const nextStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
            const nextEnd = new Date(nextStart.getTime() + 7 * 24 * 60 * 60 * 1000);
            const freeSlots = await findFreeSlots(userId, nextStart.toISOString(), nextEnd.toISOString(), 60);
            console.log('[Secretary API] 空き時間検索結果:', freeSlots.length, '件');
            if (freeSlots.length > 0) {
              parts.push(`\n\n【空き時間（今後7日間、Googleカレンダー＋NodeMap作業ブロック考慮済み）- 実データに基づく計算結果】\n${formatFreeSlotsForContext(freeSlots, 8)}`);
            } else {
              parts.push('\n\n【空き時間】\n空き時間が見つかりませんでした');
            }
          }
        } else {
          if (intent === 'calendar' || intent === 'schedule') {
            parts.push('\n\n【カレンダー】\nGoogle Calendar が未連携です。設定画面から Gmail を再連携すると、カレンダー情報も取得できるようになります。');
          }
          if (intent === 'briefing') {
            parts.push('\n\n【今日の予定】\nGoogle Calendar未連携のため予定を取得できません');
          }
        }
      } catch (calError) {
        console.error('[Secretary API] カレンダー取得エラー:', calError);
        parts.push('\n\n【今日の予定】\nカレンダー情報の取得に失敗しました。予定データはありません');
      }
    }

    // ジョブ作成 → AI下書き生成 + ジョブ登録 + 承認カード
    if (intent === 'create_job' && messages.length > 0) {
      try {
        await handleCreateJobIntent(supabase, userId, userMessage, messages, cards);
      } catch (jobError) {
        console.error('[Secretary API] ジョブ作成エラー:', jobError);
      }
    }

    // ビジネスイベント登録 → プロジェクト・コンタクトを取得してフォームカード生成
    if (intent === 'create_business_event') {
      try {
        await handleCreateBusinessEventIntent(supabase, userId, userMessage, cards);
      } catch (eventError) {
        console.error('[Secretary API] ビジネスイベント作成エラー:', eventError);
      }
    }

    // 返信下書き → 直近の未読メッセージからAI下書きを生成
    if (intent === 'reply_draft' && messages.length > 0) {
      const targetMsg = messages.find(m => !m.is_read) || messages[0];
      if (targetMsg) {
        try {
          const sb = getServerSupabase() || getSupabase();
          let contactContext: { notes: string; aiContext: string; companyName: string; department: string; relationshipType: string } | undefined;
          let recentMessages: string[] = [];

          if (sb) {
            const fromAddr = targetMsg.from_address || '';
            if (fromAddr) {
              const { data: channelData } = await sb
                .from('contact_channels')
                .select('contact_id')
                .eq('address', fromAddr)
                .limit(1);
              if (channelData && channelData.length > 0) {
                const { data: contact } = await sb
                  .from('contact_persons')
                  .select('notes, ai_context, company_name, department, relationship_type')
                  .eq('id', channelData[0].contact_id)
                  .single();
                if (contact) {
                  contactContext = {
                    notes: contact.notes || '',
                    aiContext: contact.ai_context || '',
                    companyName: contact.company_name || '',
                    department: contact.department || '',
                    relationshipType: contact.relationship_type || '',
                  };
                }
              }
              const { data: recentData } = await sb
                .from('inbox_messages')
                .select('from_name, body, direction, timestamp, subject')
                .neq('id', targetMsg.id)
                .or(`from_address.eq.${fromAddr},to_address.eq.${fromAddr}`)
                .order('timestamp', { ascending: false })
                .limit(5);
              if (recentData) {
                recentMessages = recentData.map((msg: Record<string, unknown>) => {
                  const dir = msg.direction === 'sent' ? 'あなた→相手' : '相手→あなた';
                  const bodyText = (msg.body as string || '').slice(0, 150).replace(/\n/g, ' ');
                  return `${dir}: ${bodyText}`;
                });
              }
            }
          }

          const unifiedMsg: UnifiedMessage = {
            id: targetMsg.id,
            channel: targetMsg.channel as UnifiedMessage['channel'],
            channelIcon: '',
            from: { name: targetMsg.from_name || '', address: targetMsg.from_address || '' },
            subject: targetMsg.subject || undefined,
            body: targetMsg.body || '',
            timestamp: targetMsg.created_at,
            isRead: targetMsg.is_read,
            status: 'read',
            metadata: (targetMsg.metadata || {}) as UnifiedMessage['metadata'],
          };

          const draftResult = await generateReplyDraft(unifiedMsg, undefined, {
            contactContext,
            recentMessages,
            threadContext: '',
          });

          if (draftResult.draft) {
            cards.push({
              type: 'reply_draft',
              data: {
                originalMessageId: targetMsg.id,
                channel: targetMsg.channel,
                to: targetMsg.from_address || '',
                toName: targetMsg.from_name || targetMsg.from_address || '',
                subject: targetMsg.subject ? `Re: ${targetMsg.subject.replace(/^Re:\s*/i, '')}` : undefined,
                draft: draftResult.draft,
                metadata: targetMsg.metadata || {},
              },
            });
          }
        } catch (draftError) {
          console.error('[Secretary API] 返信下書き生成エラー:', draftError);
        }
      }
    }

    // コンテキスト文（AIプロンプト用）
    if (messages.length > 0) {
      const unreadCount = messages.filter(m => !m.is_read).length;
      const msgLines = messages.slice(0, 8).map(m => {
        const status = m.is_read ? '既読' : '未読';
        const preview = (m.body || '').replace(/\n/g, ' ').slice(0, 60);
        return `- [${status}][${m.channel}] ${m.from_name}: ${m.subject || preview}`;
      });
      parts.push(`\n\n【メッセージ（${messages.length}件、未読${unreadCount}件）】\n${msgLines.join('\n')}`);
    }

    if (tasks.length > 0) {
      const active = tasks.filter(t => t.status !== 'done');
      const taskLines = active.slice(0, 8).map(t =>
        `- [${t.status}/${t.phase}] ${t.title}（${t.priority}${t.due_date ? ', ' + t.due_date : ''}）`
      );
      parts.push(`\n\n【タスク（進行中${active.length}件）】\n${taskLines.join('\n')}`);
    }

    if (jobs.length > 0) {
      const pending = jobs.filter(j => j.status === 'pending' || j.status === 'draft');
      if (pending.length > 0) {
        const jobLines = pending.map(j => `- [${j.type || 'その他'}] ${j.title}`);
        parts.push(`\n\n【未処理ジョブ（${pending.length}件）】\n${jobLines.join('\n')}`);
      }
    }
  } catch (error) {
    console.error('[Secretary API] データ取得エラー:', error);
  }

  return { contextText: parts.join(''), cards, rawData: { messages, tasks, jobs } };
}

// ========================================
// ジョブ作成ハンドラー
// ========================================
async function handleCreateJobIntent(
  supabase: SupabaseClient,
  userId: string,
  userMessage: string,
  messages: MessageRow[],
  cards: CardData[]
): Promise<void> {
  // ユーザーメッセージから対象者名を抽出
  const nameMatch = userMessage.match(/(.+?)(さん|様|氏)?[にへのを]?(返信|返事|お礼|確認|連絡|日程)/);
  const targetName = nameMatch ? nameMatch[1].replace(/^(に|へ|を|、|。)/g, '').trim() : '';

  // 対象メッセージを特定（名前マッチ or 直近未読）
  let targetMsg: MessageRow | undefined;
  if (targetName) {
    targetMsg = messages.find(m =>
      (m.from_name || '').includes(targetName) || (m.from_address || '').includes(targetName)
    );
  }
  if (!targetMsg) {
    targetMsg = messages.find(m => !m.is_read) || messages[0];
  }

  if (!targetMsg) return;

  // ジョブの種別を判定
  let jobType = 'reply';
  if (userMessage.includes('日程') || userMessage.includes('スケジュール')) jobType = 'schedule';
  else if (userMessage.includes('確認')) jobType = 'check';
  else if (userMessage.includes('お礼')) jobType = 'reply';

  // AI下書き生成
  const sb = getServerSupabase() || getSupabase();
  let contactContext: { notes: string; aiContext: string; companyName: string; department: string; relationshipType: string } | undefined;
  let recentMessages: string[] = [];

  if (sb && targetMsg.from_address) {
    const { data: channelData } = await sb
      .from('contact_channels')
      .select('contact_id')
      .eq('address', targetMsg.from_address)
      .limit(1);
    if (channelData && channelData.length > 0) {
      const { data: contact } = await sb
        .from('contact_persons')
        .select('notes, ai_context, company_name, department, relationship_type')
        .eq('id', channelData[0].contact_id)
        .single();
      if (contact) {
        contactContext = {
          notes: contact.notes || '',
          aiContext: contact.ai_context || '',
          companyName: contact.company_name || '',
          department: contact.department || '',
          relationshipType: contact.relationship_type || '',
        };
      }
    }
    const { data: recentData } = await sb
      .from('inbox_messages')
      .select('from_name, body, direction, timestamp, subject')
      .neq('id', targetMsg.id)
      .or(`from_address.eq.${targetMsg.from_address},to_address.eq.${targetMsg.from_address}`)
      .order('timestamp', { ascending: false })
      .limit(5);
    if (recentData) {
      recentMessages = recentData.map((msg: Record<string, unknown>) => {
        const dir = msg.direction === 'sent' ? 'あなた→相手' : '相手→あなた';
        const bodyText = (msg.body as string || '').slice(0, 150).replace(/\n/g, ' ');
        return `${dir}: ${bodyText}`;
      });
    }
  }

  // AI下書き生成
  const unifiedMsg: UnifiedMessage = {
    id: targetMsg.id,
    channel: targetMsg.channel as UnifiedMessage['channel'],
    channelIcon: '',
    from: { name: targetMsg.from_name || '', address: targetMsg.from_address || '' },
    subject: targetMsg.subject || undefined,
    body: targetMsg.body || '',
    timestamp: targetMsg.created_at,
    isRead: targetMsg.is_read,
    status: 'read',
    metadata: (targetMsg.metadata || {}) as UnifiedMessage['metadata'],
  };

  const draftResult = await generateReplyDraft(unifiedMsg, undefined, {
    contactContext,
    recentMessages,
    threadContext: '',
  });

  const draftText = draftResult.draft || '';

  // ジョブとしてDB登録
  const jobTitle = `${targetMsg.from_name || targetMsg.from_address || '相手'}への${jobType === 'reply' ? '返信' : jobType === 'schedule' ? '日程調整' : jobType === 'check' ? '確認' : '連絡'}`;

  const { data: createdJob } = await sb
    .from('jobs')
    .insert({
      user_id: userId,
      title: jobTitle,
      description: `元メッセージ: ${targetMsg.subject || '（件名なし）'}\n${(targetMsg.body || '').slice(0, 200)}`,
      type: jobType,
      status: 'pending',
      ai_draft: draftText,
      source_message_id: targetMsg.id,
      source_channel: targetMsg.channel,
      reply_to_message_id: targetMsg.id,
      target_address: targetMsg.from_address || '',
      target_name: targetMsg.from_name || '',
      execution_metadata: targetMsg.metadata || {},
    })
    .select()
    .single();

  if (createdJob) {
    // ジョブ承認カードを追加
    cards.push({
      type: 'job_approval',
      data: {
        id: createdJob.id,
        title: jobTitle,
        type: jobType,
        draft: draftText,
        targetName: targetMsg.from_name || targetMsg.from_address || '',
        // 実行に必要な情報を含める
        channel: targetMsg.channel,
        replyToMessageId: targetMsg.id,
        targetAddress: targetMsg.from_address || '',
        metadata: targetMsg.metadata || {},
      },
    });
  }
}

// ========================================
// ビジネスイベント作成ハンドラー
// ========================================
async function handleCreateBusinessEventIntent(
  supabase: SupabaseClient,
  userId: string,
  userMessage: string,
  cards: CardData[]
): Promise<void> {
  // プロジェクト一覧を取得
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, organization_id')
    .eq('user_id', userId)
    .order('name');

  // コンタクト一覧を取得
  const { data: contacts } = await supabase
    .from('contact_persons')
    .select('id, name, company_name')
    .order('name')
    .limit(50);

  // ユーザーメッセージからイベント情報を推定
  const m = userMessage.toLowerCase();
  let suggestedType = 'note';
  if (m.includes('打ち合わせ') || m.includes('会議') || m.includes('ミーティング') || m.includes('mtg')) suggestedType = 'meeting';
  else if (m.includes('電話') || m.includes('コール')) suggestedType = 'call';
  else if (m.includes('メール') || m.includes('mail')) suggestedType = 'email';
  else if (m.includes('チャット') || m.includes('slack') || m.includes('chatwork')) suggestedType = 'chat';
  else if (m.includes('決定') || m.includes('意思決定') || m.includes('決めた')) suggestedType = 'decision';

  // タイトルの推定（「○○の打ち合わせを記録して」→「○○の打ち合わせ」）
  let suggestedTitle = '';
  const titleMatch = userMessage.match(/[「『](.+?)[」』]/);
  if (titleMatch) {
    suggestedTitle = titleMatch[1];
  } else {
    // 「○○を記録」「○○を登録」パターン
    const actionMatch = userMessage.match(/(.+?)[をの](記録|登録|追加|作成)/);
    if (actionMatch) {
      suggestedTitle = actionMatch[1].replace(/^(ビジネス|イベント|ログ|活動)\s*/, '').trim();
    }
  }

  // コンタクト名の推定
  let suggestedContactIds: string[] = [];
  if (contacts && contacts.length > 0) {
    for (const c of contacts) {
      if (userMessage.includes(c.name)) {
        suggestedContactIds.push(c.id);
      }
    }
  }

  cards.push({
    type: 'business_event_form',
    data: {
      suggestedTitle,
      suggestedType,
      suggestedContactIds,
      projects: (projects || []).map((p: { id: string; name: string; organization_id: string | null }) => ({
        id: p.id,
        name: p.name,
      })),
      contacts: (contacts || []).map((c: { id: string; name: string; company_name: string | null }) => ({
        id: c.id,
        name: c.name,
        companyName: c.company_name || '',
      })),
    },
  });
}

// ========================================
// ヘルパー関数
// ========================================
function determineUrgency(msg: MessageRow): 'high' | 'medium' | 'low' {
  const body = (msg.body || '').toLowerCase();
  const subject = (msg.subject || '').toLowerCase();
  const text = body + ' ' + subject;

  if (text.includes('至急') || text.includes('緊急') || text.includes('urgent') || text.includes('asap')) return 'high';
  if (!msg.is_read) {
    const age = Date.now() - new Date(msg.created_at).getTime();
    if (age > 24 * 60 * 60 * 1000) return 'high';
    if (age > 4 * 60 * 60 * 1000) return 'medium';
  }
  if (text.includes('見積') || text.includes('期限') || text.includes('確認') || text.includes('ご連絡')) return 'medium';

  return msg.is_read ? 'low' : 'medium';
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'たった今';
  if (diffMin < 60) return `${diffMin}分前`;
  if (diffHour < 24) return `${diffHour}時間前`;
  if (diffDay < 7) return `${diffDay}日前`;

  return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

function phaseLabel(phase: string): string {
  const labels: Record<string, string> = { ideation: '構想', progress: '進行', result: '結果' };
  return labels[phase] || phase;
}

function priorityLabel(priority: string): string {
  const labels: Record<string, string> = { high: '高', medium: '中', low: '低' };
  return labels[priority] || priority;
}

// ========================================
// システムプロンプト
// ========================================
function buildSystemPrompt(contextSummary: string, intent: Intent, hasCards: boolean): string {
  const today = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });

  const cardNote = hasCards
    ? '\n\n重要: 画面にはデータカード（メッセージ一覧・タスクカード等）が同時に表示されています。テキスト回答ではカードの内容を繰り返さず、要約・分析・提案に集中してください。カードに表示されているデータの詳細を改めて列挙する必要はありません。'
    : '';

  const jobNote = intent === 'create_job'
    ? '\n\nジョブ（AI代行タスク）を作成しました。承認カードが表示されているので、ユーザーに内容を確認してもらい、承認→自動実行の流れを案内してください。修正が必要な場合は「修正する」ボタンが使えることも伝えてください。'
    : '';

  return `あなたはNodeMapのパーソナル秘書です。ユーザーの仕事全体を把握し、的確なサポートを提供します。

## 最重要ルール（絶対遵守）
- 【データ厳格性】下記「ユーザーのデータ」セクションに記載されている情報のみを報告すること。データに存在しない予定・メッセージ・タスクを絶対に捏造・推測・補完してはならない
- 【カレンダー厳格性】カレンダー予定は「今日の予定」セクションに明示的にリストされたもののみ報告すること。セクションに「予定なし」「カレンダー未連携」「取得失敗」と記載されている場合は、予定がないことをそのまま伝えること。架空の予定を生成してはならない
- 【不明時の対応】データが不足・取得失敗している場合は「確認できませんでした」と正直に伝えること。推測で補わない

## 基本ルール
- 日本語で簡潔に回答する（1応答200文字以内を目安）
- 具体的なデータに基づいてアドバイスする
- 緊急度が高い事項を先に報告する
- 提案は具体的に（「〇〇の返信を先にしましょう。下書きを作りますか？」）
- カードが表示される場合は、データの羅列ではなく要点と次のアクション提案に集中${cardNote}${jobNote}

## あなたの能力
- メッセージの要約・返信下書き
- タスクの状況確認・優先度の提案
- ジョブ（簡易作業）の作成と自動実行（返信、日程調整、確認連絡など）
- 承認されたジョブはAIが自動で実行する
- Google Calendar連携（今日の予定表示・空き時間検索・予定作成）
- Google Drive連携（ドキュメント一覧表示・ファイル検索・共有リンク生成）
- ファイル取り込み管理（受領ファイルのAI自動分類→確認→承認→最終保管フロー）
- ファイル格納指示（「このURLをA社に格納して」→ 確認→ 保存）
- ビジネスログの参照・活動要約の表示
- ビジネスイベント自動蓄積（メッセージ・ドキュメント・会議が時系列で自動記録）
- 週間活動要約（AI生成の週次レポート）
- 思考マップ・ナレッジの参照

## ジョブの流れ
ユーザーが「〇〇しておいて」「任せて」と言ったら:
1. ジョブを作成しAI下書きを生成
2. 承認カードを表示（ユーザーが確認）
3. 承認 → AIが自動でメッセージ送信
4. 完了報告をカードで表示

## 朝のブリーフィング
${intent === 'briefing'
    ? `今日の状況報告です。
- サマリーカード・カレンダーカード・期限アラートカード・メッセージカード・タスクカードが画面に表示されています
- テキスト回答ではカードの内容を繰り返さず、全体的な状況と「今日何から始めるべきか」の具体的な提案に集中してください
- 緊急度の高い事項（期限切れ・今日期限のタスク、未読の緊急メッセージ）があれば最初に触れてください
- カレンダーに予定があれば時間を意識したアドバイスをしてください（例：「10時からミーティングがあるので、それまでに○○の返信を」）
- 確認待ちファイルがある場合は自然に報告してください（例：「昨日2件のファイルが届いています。確認しますか？」）
- 1〜3文で簡潔にまとめること。リスト形式ではなく自然な日本語で。`
    : ''}
${intent === 'schedule'
    ? '日程調整の相談です。ユーザーのカレンダーの空き時間データを参照し、候補を提案してください。相手の名前がわかれば「○○さんとの打ち合わせ」として候補を出してください。'
    : ''}
${intent === 'calendar'
    ? '予定の確認です。【重要】下記「ユーザーのデータ」の「今日の予定」セクションに記載された予定のみを報告してください。セクションに記載がないイベントは存在しません。「予定なし」と記載されている場合は「本日の予定はありません」と報告してください。架空の予定を絶対に追加しないでください。'
    : ''}

## 今日の日付
${today}

## ユーザーのデータ
${contextSummary || '（データなし）'}`;
}

// ========================================
// POST: 秘書AI会話
// ========================================
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { message, history } = body;

    if (!message) {
      return NextResponse.json(
        { success: false, error: 'messageは必須です' },
        { status: 400 }
      );
    }

    // 意図分類
    const intent = classifyIntent(message);

    // データ取得 + カード生成
    let contextText = '';
    let cards: CardData[] = [];
    const supabase = createServerClient();
    if (supabase && isSupabaseConfigured()) {
      const result = await fetchDataAndBuildCards(supabase, userId, intent, message);
      contextText = result.contextText;
      cards = result.cards;
    }

    // Claude APIキーの確認
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: true,
        data: {
          reply: generateDemoResponse(message, intent, cards),
          cards: cards.length > 0 ? cards : undefined,
        },
      });
    }

    // 会話履歴を構築（最新15件まで）
    const conversationHistory = (history || []).slice(-15).map(
      (msg: { role: string; content: string }) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })
    );
    conversationHistory.push({ role: 'user' as const, content: message });

    // システムプロンプト構築
    const systemPrompt = buildSystemPrompt(contextText, intent, cards.length > 0);

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 800,
      system: systemPrompt,
      messages: conversationHistory,
    });

    const reply =
      response.content[0]?.type === 'text'
        ? response.content[0].text
        : '応答を生成できませんでした';

    return NextResponse.json({
      success: true,
      data: {
        reply,
        cards: cards.length > 0 ? cards : undefined,
      },
    });
  } catch (error) {
    console.error('[Secretary Chat API] エラー:', error);
    return NextResponse.json(
      { success: false, error: '秘書応答の生成に失敗しました' },
      { status: 500 }
    );
  }
}

// ========================================
// デモ応答生成（APIキーなし時）
// ========================================
function generateDemoResponse(message: string, intent: Intent, cards: CardData[]): string {
  const hasCards = cards.length > 0;

  switch (intent) {
    case 'briefing':
      return hasCards
        ? 'おはようございます。今日の状況をまとめました。\n\nカードに全体サマリー・予定・期限アラート・メッセージ・タスクを表示しています。緊急度の高いものから順に対応していきましょう。'
        : 'おはようございます。\n\n現在データがないようです。メッセージの受信やタスクの登録を始めると、ここに状況報告が表示されます。';
    case 'inbox':
      return hasCards
        ? 'メッセージ一覧です。カードから確認したいメッセージをクリックしてください。'
        : '現在受信メッセージはありません。';
    case 'tasks':
      return hasCards
        ? 'タスクの状況です。優先度順に表示しています。「続ける」で対話を再開できます。'
        : '進行中のタスクはありません。新しいタスクを作成しますか？';
    case 'jobs':
      return hasCards
        ? '対応が必要な項目です。各カードから承認・修正・却下を選択できます。'
        : '未処理のジョブはありません。';
    case 'create_job':
      return hasCards
        ? 'ジョブを作成し、下書きを用意しました。\n\n内容を確認して「承認して実行」を押すと、AIが自動で送信します。修正が必要なら「修正する」をクリックしてください。'
        : '対象のメッセージが見つかりませんでした。「新着メッセージを見せて」で確認してみてください。';
    case 'reply_draft':
      return hasCards
        ? '返信の下書きを作成しました。内容を確認して、修正が必要なら「修正する」を押してください。'
        : '返信対象のメッセージが見つかりませんでした。「新着メッセージを見せて」で確認してみてください。';
    case 'calendar':
      return 'カレンダーの予定を確認しました。上の情報を参照してください。';
    case 'schedule':
      return '空き時間を検索しました。候補の日時を確認してください。';
    case 'file_intake':
      return hasCards
        ? '確認待ちのファイルがあります。カードからAIの分類結果を確認し、承認または修正してください。一括承認も可能です。'
        : '確認待ちのファイルはありません。メッセージの添付ファイルは自動で取り込まれ、ここに表示されます。';
    case 'store_file':
      return hasCards
        ? 'URLを検出しました。格納先の組織・プロジェクトを選択して「格納する」を押してください。'
        : 'URLが検出できませんでした。格納したいURLを含めてもう一度お伝えください。';
    case 'business_summary':
      return hasCards
        ? '活動要約を表示します。プロジェクトごとの連絡・提出物・会議の状況をまとめています。'
        : 'まだAI要約が生成されていません。毎週月曜日に自動生成されます。ビジネスログ画面で個別のイベントは確認できます。';
    case 'documents':
      return hasCards
        ? 'ドキュメント一覧を表示しました。ファイル名をクリックするとGoogle Driveで開けます。'
        : 'Google Driveに保存されたドキュメントはまだありません。メッセージの添付ファイルが自動的に保存されます。';
    case 'share_file':
      return hasCards
        ? '共有するファイルを選んでください。カードから共有リンクを生成できます。'
        : '共有するファイルが見つかりませんでした。まずドキュメント一覧を確認してみてください。';
    case 'thought_map':
      return '思考マップへのリンクを表示しました。クリックして開いてください。';
    case 'create_business_event':
      return hasCards
        ? 'イベント登録フォームを表示しました。内容を入力して「記録する」を押してください。メッセージの内容からタイトルや種別を推定しています。'
        : 'イベント登録フォームの準備に失敗しました。もう一度お試しください。';
    case 'business_log':
      return 'ビジネスログへのリンクを表示しました。クリックして開いてください。';
    default:
      return `「${message}」について確認しました。\n\nどのように進めましょうか？`;
  }
}
