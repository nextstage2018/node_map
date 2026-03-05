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
  createEvent,
} from '@/services/calendar/calendarClient.service';
import type { CalendarEvent } from '@/services/calendar/calendarClient.service';
import type { UnifiedMessage } from '@/lib/types';
import { EMAIL_ENABLED } from '@/lib/constants';

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
  | 'projects'        // プロジェクト一覧
  | 'documents'       // ドキュメント・ファイル一覧
  | 'file_intake'     // ファイル確認・承認フロー
  | 'store_file'      // ファイル格納指示
  | 'share_file'      // ファイル共有
  | 'thought_map'     // 思考マップ
  | 'business_log'    // ビジネスログ
  | 'business_summary' // 活動要約・週間レポート
  | 'create_business_event' // ビジネスイベント登録
  | 'knowledge_structuring' // ナレッジ構造化提案
  | 'create_calendar_event' // カレンダー予定作成
  | 'create_drive_folder'   // Driveフォルダ/ドキュメント作成
  | 'create_task'           // タスク作成
  | 'task_progress'         // タスク進行（AIに相談）
  | 'pattern_analysis'      // Phase 51b: 傾向分析
  | 'knowledge_reuse'       // Phase 51b: 過去知見の再利用
  | 'setup_organization'    // Phase 52: 組織セットアップ
  | 'create_contact'        // Phase 53c: コンタクト作成
  | 'create_organization'   // Phase 53c: 組織作成（手動）
  | 'create_project'        // Phase 53c: プロジェクト作成
  | 'search_contact'        // Phase 53c: コンタクト検索
  | 'task_negotiation'      // Phase 56c: タスク修正提案・調整
  | 'consultations'         // Phase 58: 社内相談確認
  | 'link_channel'          // Phase A: チャンネル→プロジェクト紐づけ
  | 'task_external_resource' // Phase E: タスクに外部資料を取り込み
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

  // カレンダー予定作成（「予定を追加/登録/入れて」）— 予定確認より先に判定
  if (m.includes('予定') && (m.includes('追加') || m.includes('登録') || m.includes('入れ') || m.includes('作成') || m.includes('作って') || m.includes('セット'))) return 'create_calendar_event';
  if (m.includes('カレンダー') && (m.includes('追加') || m.includes('登録') || m.includes('入れ') || m.includes('作成'))) return 'create_calendar_event';

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

  // メッセージ詳細（特定メッセージの中身を見たい — inboxより先に判定）
  if (m.includes('メッセージid') || m.includes('メッセージid:') || m.match(/id[:\s]*(email-|slack-|cw-)/i)) return 'message_detail';
  if (m.includes('詳細') && (m.includes('見せて') || m.includes('教えて') || m.includes('内容') || m.includes('本文'))) return 'message_detail';

  // メッセージ
  if (m.includes('メッセージ') || m.includes('メール') || m.includes('新着') || m.includes('受信')) return 'inbox';
  if (m.includes('誰から') || m.includes('連絡')) return 'inbox';

  // プロジェクト一覧
  if (m.includes('プロジェクト') && (m.includes('一覧') || m.includes('教えて') || m.includes('リスト') || m.includes('確認') || m.includes('見せて') || m.includes('見たい'))) return 'projects';

  // Phase 56c: タスク修正提案・調整（「タスクの修正」「納期を変更」「優先度を上げ」「タスクを調整」）
  if (m.includes('タスク') && (m.includes('修正') || m.includes('変更') || m.includes('調整'))) return 'task_negotiation';
  if ((m.includes('納期') || m.includes('期限') || m.includes('締め切り')) && (m.includes('変更') || m.includes('延') || m.includes('前倒') || m.includes('ずらし'))) return 'task_negotiation';
  if (m.includes('優先度') && (m.includes('変更') || m.includes('上げ') || m.includes('下げ') || m.includes('変え'))) return 'task_negotiation';
  if (m.includes('担当') && (m.includes('変更') || m.includes('変え') || m.includes('替え'))) return 'task_negotiation';

  // Phase E: タスクに外部資料を取り込み（「タスクに資料を追加」「外部資料を取り込み」「リサーチ結果をタスクに」）
  if (m.includes('外部資料') || m.includes('外部ai') || m.includes('deep research')) return 'task_external_resource';
  if (m.includes('タスク') && (m.includes('資料') || m.includes('リサーチ') || m.includes('取り込')) && (m.includes('追加') || m.includes('取り込') || m.includes('アップロード') || m.includes('貼り付') || m.includes('添付'))) return 'task_external_resource';
  if ((m.includes('壁打ち') || m.includes('ai会話')) && (m.includes('資料') || m.includes('参考') || m.includes('取り込'))) return 'task_external_resource';

  // タスク作成（「タスクを作成」「タスクを追加」「新しいタスク」「タスクとして登録」）
  if (m.includes('タスク') && (m.includes('作成') || m.includes('追加') || m.includes('作って') || m.includes('登録') || m.includes('新規') || m.includes('新しい'))) return 'create_task';
  // タスク進行（「タスクを進める」「タスクに取り組む」「タスクについて相談」）
  if (m.includes('タスク') && (m.includes('進め') || m.includes('取り組') || m.includes('相談') || m.includes('について') || m.includes('続き'))) return 'task_progress';

  // タスク一覧
  if (m.includes('タスク') || m.includes('やること') || m.includes('期限') || m.includes('進行中')) return 'tasks';

  // Phase 58: 社内相談確認（「相談を確認」「相談が来てる」「相談に回答」）
  if (m.includes('相談') && (m.includes('確認') || m.includes('来') || m.includes('回答') || m.includes('見') || m.includes('届'))) return 'consultations';

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

  // Driveフォルダ/ドキュメント作成（documentsより先に判定）
  if ((m.includes('フォルダ') || m.includes('ドライブ') || m.includes('drive')) && (m.includes('作成') || m.includes('作って') || m.includes('作りたい') || m.includes('新規') || m.includes('追加'))) return 'create_drive_folder';
  if (m.includes('ドキュメント') && (m.includes('作成') || m.includes('作って') || m.includes('新規'))) return 'create_drive_folder';

  // ドキュメント・ファイル（Drive）
  if (m.includes('共有') && (m.includes('ファイル') || m.includes('資料') || m.includes('ドキュメント') || m.includes('ドライブ'))) return 'share_file';
  if (m.includes('ドライブ') || m.includes('google drive') || m.includes('drive')) return 'documents';
  if (m.includes('ファイル') || m.includes('資料') || m.includes('ドキュメント') || m.includes('書類')) return 'documents';
  if (m.includes('添付') && (m.includes('一覧') || m.includes('見') || m.includes('検索'))) return 'documents';

  // ナレッジ構造化提案（thought_mapより先に判定）
  if (m.includes('ナレッジ') && (m.includes('提案') || m.includes('構造') || m.includes('整理') || m.includes('分類'))) return 'knowledge_structuring';
  if (m.includes('キーワード') && (m.includes('整理') || m.includes('グループ') || m.includes('分類') || m.includes('提案'))) return 'knowledge_structuring';
  if (m.includes('自動') && (m.includes('分類') || m.includes('構造化'))) return 'knowledge_structuring';
  if (m.includes('ナレッジ') && m.includes('確認')) return 'knowledge_structuring';

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

  // Phase 51b: 傾向分析（「傾向」「パターン」「最近どう」「振り返り」）
  if (m.includes('傾向') || m.includes('パターン') || m.includes('振り返')) return 'pattern_analysis';
  if (m.includes('最近') && (m.includes('どう') || m.includes('傾向') || m.includes('状況'))) return 'pattern_analysis';
  if (m.includes('分析') && (m.includes('仕事') || m.includes('活動') || m.includes('作業'))) return 'pattern_analysis';

  // Phase 51b: 過去知見の再利用（「前回の」「この前の方法」「以前の」）
  if (m.includes('前回') || m.includes('この前') || m.includes('以前') || m.includes('あの時')) return 'knowledge_reuse';
  if (m.includes('同じよう') || m.includes('似たような')) return 'knowledge_reuse';

  // Phase 53c: コンタクト作成（「コンタクトを登録」「連絡先を追加」「〇〇さんを登録」）
  if (m.includes('コンタクト') && (m.includes('登録') || m.includes('追加') || m.includes('作成') || m.includes('新規') || m.includes('新しい'))) return 'create_contact';
  if (m.includes('連絡先') && (m.includes('登録') || m.includes('追加') || m.includes('作成'))) return 'create_contact';
  if (m.match(/(.+?)(さん|様)(を|の)(登録|追加|コンタクト)/)) return 'create_contact';

  // Phase 53c: コンタクト検索（「〇〇さんの情報」「コンタクト情報」）
  if (m.includes('コンタクト') && (m.includes('検索') || m.includes('探し') || m.includes('情報') || m.includes('見せて') || m.includes('教えて'))) return 'search_contact';
  if (m.match(/(.+?)(さん|様)(の|について)(情報|連絡先|メール|教えて)/)) return 'search_contact';

  // Phase 53c: 組織作成（手動）
  if (m.includes('組織') && (m.includes('新規') || m.includes('新しい'))) return 'create_organization';

  // Phase 52: 組織セットアップ（「組織を登録」「取引先を追加」「会社を設定」）
  if (m.includes('組織') && (m.includes('設定') || m.includes('作成') || m.includes('追加') || m.includes('登録') || m.includes('整理') || m.includes('確認'))) return 'setup_organization';
  if (m.includes('取引先') && (m.includes('追加') || m.includes('登録') || m.includes('設定'))) return 'setup_organization';
  if (m.includes('会社') && (m.includes('登録') || m.includes('追加') || m.includes('設定'))) return 'setup_organization';
  if (m.includes('未登録') && (m.includes('組織') || m.includes('会社'))) return 'setup_organization';

  // Phase 53c: プロジェクト作成
  if (m.includes('プロジェクト') && (m.includes('作成') || m.includes('追加') || m.includes('新規') || m.includes('新しい') || m.includes('作って') || m.includes('立ち上げ'))) return 'create_project';

  // Phase A: チャンネル→プロジェクト紐づけ
  if (m.includes('チャンネル') && (m.includes('紐づけ') || m.includes('紐付け') || m.includes('リンク') || m.includes('関連付') || m.includes('結び'))) return 'link_channel';
  if (m.includes('ルーム') && (m.includes('紐づけ') || m.includes('紐付け') || m.includes('プロジェクト'))) return 'link_channel';

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
    if (['briefing', 'tasks', 'jobs', 'general', 'create_task', 'task_progress', 'pattern_analysis', 'knowledge_reuse'].includes(intent)) {
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
    if (['briefing', 'jobs', 'create_job', 'general', 'pattern_analysis'].includes(intent)) {
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

    // Phase B: メール休眠中はメールメッセージを除外
    if (!EMAIL_ENABLED) {
      messages = messages.filter(m => m.channel !== 'email');
    }

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
      const activeTaskCount = tasks.filter(t => t.status !== 'done' && t.status !== 'proposed').length;
      const proposedTaskCount = tasks.filter(t => t.status === 'proposed').length;
      const pendingJobCount = jobs.filter(j => j.status === 'pending' || j.status === 'draft').length;
      const consultingJobCount = jobs.filter(j => j.status === 'consulting').length;
      const draftReadyJobCount = jobs.filter(j => j.status === 'draft_ready').length;

      // Phase 58: あなた宛ての未回答相談数を取得
      let pendingConsultationCount = 0;
      try {
        const { data: pendingConsults } = await supabase
          .from('consultations')
          .select('id')
          .eq('responder_user_id', userId)
          .eq('status', 'pending');
        pendingConsultationCount = pendingConsults?.length || 0;
      } catch { /* ignore */ }

      // 未確認ファイル数を取得
      let pendingFileCount = 0;
      try {
        const { getPendingStagingFiles } = await import('@/services/drive/driveClient.service');
        const stagingFiles = await getPendingStagingFiles(userId);
        pendingFileCount = stagingFiles.length;
      } catch {
        // エラー時は0のまま
      }

      // ナレッジ提案数を取得
      let pendingKnowledgeProposals = 0;
      try {
        const { count } = await supabase
          .from('knowledge_clustering_proposals')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'pending');
        pendingKnowledgeProposals = count || 0;
      } catch {
        // エラー時は0のまま
      }

      // Phase 56: タスク提案数を取得
      let pendingTaskSuggestions = 0;
      try {
        const { count: tsCount } = await supabase
          .from('task_suggestions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'pending');
        pendingTaskSuggestions = tsCount || 0;
      } catch {
        // エラー時は0のまま
      }

      // Phase 56c: 調整待ちタスク数を取得
      let pendingNegotiations = 0;
      try {
        const { TaskNegotiationService } = await import('@/services/task/taskNegotiation.service');
        pendingNegotiations = await TaskNegotiationService.getPendingNegotiationCount(userId);
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
          proposedTaskCount,
          pendingJobCount,
          consultingJobCount,
          draftReadyJobCount,
          pendingConsultationCount,
          todayEventCount: calendarEvents.filter(e => !e.isAllDay).length,
          pendingFileCount,
          pendingKnowledgeProposals,
          pendingTaskSuggestions,
          pendingNegotiations,
          nextEvent,
        },
      });

      // (2) カレンダー予定カード（終日予定を除外して時刻付き予定のみ表示）
      const timedEvents = calendarEvents.filter(ev => !ev.isAllDay);
      if (timedEvents.length > 0) {
        cards.push({
          type: 'calendar_events',
          data: {
            date: '今日',
            events: timedEvents.map(ev => {
              const startDate = new Date(ev.start);
              const endDate = new Date(ev.end);
              const isNow = startDate <= now && endDate > now;
              return {
                id: ev.id,
                title: ev.summary,
                startTime: startDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
                endTime: endDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
                location: ev.location,
                isAllDay: false,
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

    // メッセージ詳細 → MessageDetailCard（特定メッセージをDB直接取得）
    if (intent === 'message_detail') {
      // メッセージIDを抽出
      const idMatch = userMessage.match(/(?:メッセージID[:\s]*|id[:\s]*)([\w\-<>@.]+)/i)
        || userMessage.match(/(email-[^\s]+|slack-[^\s]+|cw-[^\s]+)/i);
      const targetMsgId = idMatch?.[1]?.trim();

      if (targetMsgId) {
        // DBから直接取得
        const { data: msgData } = await supabase
          .from('inbox_messages')
          .select('id, channel, from_name, from_address, subject, body, is_read, direction, created_at, metadata, to_list')
          .eq('id', targetMsgId)
          .single();

        if (msgData) {
          cards.push({
            type: 'message_detail',
            data: {
              id: msgData.id,
              channel: msgData.channel,
              from: msgData.from_name || msgData.from_address || '不明',
              fromAddress: msgData.from_address || '',
              subject: msgData.subject || '',
              body: msgData.body || '（本文なし）',
              timestamp: formatRelativeTime(msgData.created_at),
              fullTimestamp: msgData.created_at,
              isRead: msgData.is_read,
              metadata: msgData.metadata || {},
            },
          });
          // 既読にする
          await supabase
            .from('inbox_messages')
            .update({ is_read: true })
            .eq('id', targetMsgId);

          parts.push(`メッセージ詳細（${msgData.from_name || msgData.from_address}）を表示`);
        } else {
          // IDマッチなし → メッセージ一覧から名前検索
          const nameMatch = userMessage.match(/(.+?)(?:さん|様|から|の)(メッセージ|メール|連絡|詳細)/);
          if (nameMatch && messages.length > 0) {
            const searchName = nameMatch[1].trim();
            const found = messages.find(m =>
              (m.from_name || '').includes(searchName) || (m.from_address || '').includes(searchName)
            );
            if (found) {
              cards.push({
                type: 'message_detail',
                data: {
                  id: found.id,
                  channel: found.channel,
                  from: found.from_name || found.from_address || '不明',
                  fromAddress: found.from_address || '',
                  subject: found.subject || '',
                  body: found.body || '（本文なし）',
                  timestamp: formatRelativeTime(found.created_at),
                  fullTimestamp: found.created_at,
                  isRead: found.is_read,
                  metadata: found.metadata || {},
                },
              });
              parts.push(`${found.from_name || found.from_address}のメッセージ詳細を表示`);
            }
          }
        }
      } else {
        // IDなし → 直近メッセージ一覧を表示（フォールバック）
        if (messages.length > 0) {
          cards.push({
            type: 'inbox_summary',
            data: {
              items: messages.slice(0, 10).map(m => ({
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

    // Phase 58: 社内相談カード（あなた宛ての未回答相談）
    if (intent === 'consultations' || intent === 'briefing') {
      try {
        const { data: pendingConsults } = await supabase
          .from('consultations')
          .select('*, jobs(title, description, source_message_id, source_channel)')
          .eq('responder_user_id', userId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(5);

        if (pendingConsults && pendingConsults.length > 0) {
          cards.push({
            type: 'consultation_list',
            data: {
              consultations: pendingConsults.map((c: Record<string, unknown>) => ({
                id: c.id,
                jobTitle: (c.jobs as Record<string, unknown>)?.title || '社内相談',
                question: c.question,
                threadSummary: c.thread_summary,
                createdAt: c.created_at,
              })),
            },
          });
        }
      } catch (e) {
        console.error('[Agent] 相談取得エラー:', e);
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

    // ナレッジ構造化提案 → KnowledgeProposalCard
    if (intent === 'knowledge_structuring') {
      try {
        // 待機中の提案を取得
        const { data: pendingProposals } = await supabase
          .from('knowledge_clustering_proposals')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(3);

        if (pendingProposals && pendingProposals.length > 0) {
          for (const proposal of pendingProposals) {
            cards.push({
              type: 'knowledge_proposal',
              data: {
                id: proposal.id,
                proposedStructure: proposal.proposed_structure,
                clusteringConfidence: proposal.clustering_confidence,
                aiReasoning: proposal.ai_reasoning,
                entryCount: proposal.entry_count,
                proposalWeek: proposal.proposal_week,
              },
            });
          }
          parts.push(`ナレッジ構造化の提案が${pendingProposals.length}件あります。`);
        } else {
          // 提案がない場合、未確認キーワード数を表示
          const { count } = await supabase
            .from('knowledge_master_entries')
            .select('*', { count: 'exact', head: true })
            .eq('is_confirmed', false);

          parts.push(`現在待機中のナレッジ提案はありません。未確認キーワード: ${count || 0}個`);
          if ((count || 0) >= 5) {
            parts.push('手動でクラスタリングを実行することもできます。');
          }
        }
      } catch (err) {
        console.error('[Agent] Knowledge structuring error:', err);
        parts.push('ナレッジ提案の取得に失敗しました。');
      }
    }

    // プロジェクト一覧（Phase D: 組織詳細ページのプロジェクトタブへ誘導）
    if (intent === 'projects') {
      try {
        const { data: projectList } = await supabase
          .from('projects')
          .select('id, name, status, created_at, organization_id, organizations(name)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (projectList && projectList.length > 0) {
          // 組織別にグルーピング
          const byOrg = new Map<string, { orgName: string; orgId: string; count: number }>();
          let noOrgCount = 0;
          for (const p of projectList) {
            const orgData = p.organizations && typeof p.organizations === 'object' && 'name' in p.organizations
              ? p.organizations as { name: string }
              : null;
            if (p.organization_id && orgData) {
              const existing = byOrg.get(p.organization_id);
              if (existing) {
                existing.count++;
              } else {
                byOrg.set(p.organization_id, { orgName: orgData.name, orgId: p.organization_id, count: 1 });
              }
            } else {
              noOrgCount++;
            }
          }

          const projectLines = projectList.map((p: { name: string; status: string; organizations?: { name: string } | null }) => {
            const orgName = p.organizations && typeof p.organizations === 'object' && 'name' in p.organizations ? (p.organizations as { name: string }).name : '';
            return `- ${p.name}（${p.status || 'active'}）${orgName ? `[${orgName}]` : ''}`;
          }).join('\n');
          parts.push(`\n\n【プロジェクト一覧（${projectList.length}件）】\n${projectLines}`);

          // Phase D: 組織別にナビゲーションカードを出す
          for (const [, orgGroup] of byOrg) {
            cards.push({
              type: 'navigate',
              data: {
                href: `/organizations/${orgGroup.orgId}`,
                label: `${orgGroup.orgName} のプロジェクト`,
                description: `${orgGroup.count}件のプロジェクト — 組織詳細のプロジェクトタブで確認`,
              },
            });
          }
          // 組織未所属があればビジネスログへ
          if (noOrgCount > 0) {
            cards.push({
              type: 'navigate',
              data: {
                href: '/business-log',
                label: 'ビジネスログでプロジェクトを管理',
                description: `組織未所属のプロジェクト: ${noOrgCount}件`,
              },
            });
          }
        } else {
          parts.push('\n\n【プロジェクト】\nプロジェクトはまだ登録されていません。組織詳細ページのプロジェクトタブから新規プロジェクトを作成できます。');
          cards.push({
            type: 'navigate',
            data: {
              href: '/organizations',
              label: '組織一覧からプロジェクトを作成',
              description: '組織を選択してプロジェクトタブからプロジェクトを追加できます',
            },
          });
        }
      } catch (err) {
        console.error('[Agent] Projects fetch error:', err);
        parts.push('プロジェクト情報の取得に失敗しました。');
      }
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

    // カレンダー予定作成
    if (intent === 'create_calendar_event') {
      try {
        const calConnected = await isCalendarConnected(userId);
        if (!calConnected) {
          parts.push('\n\n【カレンダー】\nGoogle Calendar が未連携です。設定画面からGmailを再連携すると、カレンダー機能が使えるようになります。');
          cards.push({
            type: 'navigate',
            data: { href: '/settings', label: '設定画面を開く', description: 'Gmail再連携でカレンダー機能を有効化' },
          });
        } else {
          // AIでメッセージから日時・タイトルを解析
          const now = new Date();
          const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          const parsePrompt = `ユーザーのメッセージからカレンダー予定の情報を抽出してください。
今日の日付: ${todayStr}

メッセージ: "${userMessage}"

以下のJSON形式で返してください（他のテキストは不要）:
{"summary":"予定のタイトル","date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM","description":"説明（あれば）"}

ルール:
- 「明日」は今日+1日、「明後日」は+2日
- 「来週月曜」などは適切に計算
- 時間が指定されていなければ startTime="10:00", endTime="11:00" をデフォルトに
- 終了時間が指定されていなければ開始から1時間後`;

          let parsed = null;
          const apiKey = process.env.ANTHROPIC_API_KEY;
          if (apiKey) {
            try {
              const parseRes = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-api-key': apiKey,
                  'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                  model: 'claude-sonnet-4-5-20250929',
                  max_tokens: 200,
                  messages: [{ role: 'user', content: parsePrompt }],
                }),
              });
              const parseData = await parseRes.json();
              const parseText = parseData?.content?.[0]?.text || '';
              // JSONを抽出
              const jsonMatch = parseText.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
              }
            } catch (parseErr) {
              console.error('[Agent] Calendar parse error:', parseErr);
            }
          }

          if (parsed && parsed.summary && parsed.date && parsed.startTime) {
            const startISO = `${parsed.date}T${parsed.startTime}:00`;
            const endISO = `${parsed.date}T${parsed.endTime || parsed.startTime.replace(/:\d{2}$/, ':00').replace(/^(\d{2}):/, (m: string, h: string) => `${String(Number(h) + 1).padStart(2, '0')}:`)}:00`;

            const event = await createEvent(userId, {
              summary: parsed.summary,
              start: startISO,
              end: endISO,
              description: parsed.description || undefined,
            });

            if (event) {
              parts.push(`\n\n【カレンダー予定作成完了】\n- タイトル: ${event.summary}\n- 日時: ${new Date(event.start).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} 〜 ${new Date(event.end).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}\n- リンク: ${event.htmlLink || 'Google Calendar'}`);
              cards.push({
                type: 'action_result',
                data: {
                  success: true,
                  message: `予定「${event.summary}」を${parsed.date}に登録しました`,
                },
              });
            } else {
              parts.push('\n\n【カレンダー】\n予定の作成に失敗しました。Google Calendar APIの権限を確認してください。設定画面からGmailを再連携すると解決する場合があります。');
              cards.push({
                type: 'action_result',
                data: { success: false, message: '予定の作成に失敗しました' },
              });
            }
          } else {
            parts.push('\n\n【カレンダー】\n予定の日時やタイトルを読み取れませんでした。「明日14時にミーティング」のように具体的に教えてください。');
          }
        }
      } catch (calErr) {
        console.error('[Agent] Calendar create error:', calErr);
        parts.push('\n\nカレンダー予定の作成中にエラーが発生しました。');
      }
    }

    // Driveフォルダ/ドキュメント作成（プロジェクト紐づけ + 命名規則適用）
    if (intent === 'create_drive_folder') {
      try {
        const { isDriveConnected, getOrCreateOrgFolder, getOrCreateProjectFolder, createFolder: driveCreateFolder, createShareLink } = await import('@/services/drive/driveClient.service');
        const driveConnected = await isDriveConnected(userId);
        if (!driveConnected) {
          parts.push('\n\n【Google Drive】\nGoogle Drive が未連携です。設定画面からGmailを再連携し、Driveスコープを有効にしてください。');
          cards.push({
            type: 'navigate',
            data: { href: '/settings', label: '設定画面を開く', description: 'Gmail再連携でDrive機能を有効化' },
          });
        } else {
          // プロジェクト一覧を取得してメッセージからマッチするものを探す
          const { data: userProjects } = await supabase
            .from('projects')
            .select('id, name, organization_id, organizations(id, name)')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false });

          const projectList = userProjects || [];

          // メッセージからプロジェクト名を検出
          let matchedProject: { id: string; name: string; organization_id: string | null; organizations?: { id: string; name: string } | null } | null = null;
          for (const p of projectList) {
            if (userMessage.includes(p.name)) {
              matchedProject = p;
              break;
            }
          }

          // AIでプロジェクト推定（マッチしなかった場合）
          if (!matchedProject && projectList.length > 0) {
            const apiKey = process.env.ANTHROPIC_API_KEY;
            if (apiKey) {
              try {
                const projectNames = projectList.map((p: { name: string }) => p.name).join(', ');
                const parseRes = await fetch('https://api.anthropic.com/v1/messages', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                  },
                  body: JSON.stringify({
                    model: 'claude-sonnet-4-5-20250929',
                    max_tokens: 100,
                    messages: [{ role: 'user', content: `ユーザーのメッセージに最も関連するプロジェクト名を以下から1つ選んでください。関連がなければ "none" と返してください。プロジェクト名だけを返してください。\n\nプロジェクト一覧: ${projectNames}\n\nメッセージ: "${userMessage}"` }],
                  }),
                });
                const parseData = await parseRes.json();
                const guessedName = (parseData?.content?.[0]?.text || '').trim();
                if (guessedName && guessedName !== 'none') {
                  matchedProject = projectList.find((p: { name: string }) => p.name === guessedName) || null;
                }
              } catch { /* ignore */ }
            }
          }

          if (matchedProject && matchedProject.organization_id) {
            // プロジェクト紐づけフォルダ作成（既存の階層構造を利用）
            const orgData = matchedProject.organizations && typeof matchedProject.organizations === 'object' && 'name' in matchedProject.organizations
              ? matchedProject.organizations as { id: string; name: string }
              : null;
            const orgName = orgData?.name || '未分類組織';

            // 組織フォルダ → プロジェクトフォルダの階層で作成（既存なら再利用）
            const orgFolderId = await getOrCreateOrgFolder(userId, matchedProject.organization_id, orgName);
            if (orgFolderId) {
              const projectFolderId = await getOrCreateProjectFolder(userId, matchedProject.organization_id, matchedProject.id, matchedProject.name);
              if (projectFolderId) {
                // 共有リンクを付与
                const folderUrl = `https://drive.google.com/drive/folders/${projectFolderId}`;
                let shareUrl = folderUrl;
                try {
                  const shareLink = await createShareLink(userId, projectFolderId, 'writer');
                  if (shareLink?.webViewLink) shareUrl = shareLink.webViewLink;
                } catch { /* 共有失敗は無視 */ }

                parts.push(`\n\n【Google Drive フォルダ作成完了】\n- プロジェクト: ${matchedProject.name}\n- 組織: ${orgName}\n- フォルダ構成: [NodeMap] ${orgName} / ${matchedProject.name}\n- リンク: ${shareUrl}\n- 共有: リンクを知っている全員が編集可能`);
                cards.push({
                  type: 'action_result',
                  data: { success: true, message: `「${matchedProject.name}」のDriveフォルダを作成しました（共有リンク付き）` },
                });
              } else {
                parts.push('\n\n【Google Drive】\nプロジェクトフォルダの作成に失敗しました。');
                cards.push({ type: 'action_result', data: { success: false, message: 'フォルダの作成に失敗しました' } });
              }
            } else {
              parts.push('\n\n【Google Drive】\n組織フォルダの作成に失敗しました。');
              cards.push({ type: 'action_result', data: { success: false, message: 'フォルダの作成に失敗しました' } });
            }
          } else if (matchedProject && !matchedProject.organization_id) {
            // 組織未設定のプロジェクト → ルート配下に直接作成
            const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || undefined;
            const folder = await driveCreateFolder(userId, `[NodeMap] ${matchedProject.name}`, rootFolderId);
            if (folder) {
              // drive_foldersにプロジェクト紐づけで記録
              await supabase.from('drive_folders').upsert({
                user_id: userId,
                project_id: matchedProject.id,
                drive_folder_id: folder.id,
                folder_name: folder.name,
                hierarchy_level: 2,
              }, { onConflict: 'drive_folder_id' });

              let shareUrl = folder.webViewLink;
              try {
                const shareLink = await createShareLink(userId, folder.id, 'writer');
                if (shareLink?.webViewLink) shareUrl = shareLink.webViewLink;
              } catch { /* 共有失敗は無視 */ }

              parts.push(`\n\n【Google Drive フォルダ作成完了】\n- プロジェクト: ${matchedProject.name}\n- フォルダ名: ${folder.name}\n- リンク: ${shareUrl}\n- 共有: リンクを知っている全員が編集可能`);
              cards.push({
                type: 'action_result',
                data: { success: true, message: `「${matchedProject.name}」のDriveフォルダを作成しました（共有リンク付き）` },
              });
            } else {
              parts.push('\n\n【Google Drive】\nフォルダの作成に失敗しました。');
              cards.push({ type: 'action_result', data: { success: false, message: 'フォルダの作成に失敗しました' } });
            }
          } else {
            // プロジェクトが特定できない → プロジェクト一覧を表示して案内
            if (projectList.length > 0) {
              const projListText = projectList.map((p: { name: string }, idx: number) => `${idx + 1}. ${p.name}`).join('\n');
              parts.push(`\n\n【Google Drive】\nどのプロジェクトのフォルダを作成しますか？\n\n${projListText}\n\n例:「○○プロジェクトのフォルダを作成して」のようにお伝えください。`);
            } else {
              // プロジェクト自体がない → 汎用フォルダ作成
              const folderNameMatch = userMessage.match(/[「『](.+?)[」』]/);
              let folderName = folderNameMatch ? folderNameMatch[1] : `新規フォルダ_${new Date().toISOString().slice(0, 10)}`;

              const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || undefined;
              const folder = await driveCreateFolder(userId, folderName, rootFolderId);
              if (folder) {
                let shareUrl = folder.webViewLink;
                try {
                  const shareLink = await createShareLink(userId, folder.id, 'writer');
                  if (shareLink?.webViewLink) shareUrl = shareLink.webViewLink;
                } catch { /* ignore */ }

                parts.push(`\n\n【Google Drive フォルダ作成完了】\n- フォルダ名: ${folder.name}\n- リンク: ${shareUrl}\n- 共有: リンクを知っている全員が編集可能\n\n※プロジェクトに紐づけるには、先にビジネスログでプロジェクトを作成してください。`);
                cards.push({ type: 'action_result', data: { success: true, message: `フォルダ「${folder.name}」を作成しました（共有リンク付き）` } });
              } else {
                parts.push('\n\n【Google Drive】\nフォルダの作成に失敗しました。');
                cards.push({ type: 'action_result', data: { success: false, message: 'フォルダの作成に失敗しました' } });
              }
            }
          }
        }
      } catch (driveErr) {
        console.error('[Agent] Drive create error:', driveErr);
        parts.push('\n\nDriveフォルダの作成中にエラーが発生しました。');
      }
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
              parts.push(`\n\n【空き時間（今後7日間、Googleカレンダー＋NodeMap作業ブロック考慮済み・祝日除外）- 実データに基づく計算結果】\n${formatFreeSlotsForContext(freeSlots)}`);
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

    // タスク作成 → フォームカード生成
    if (intent === 'create_task') {
      try {
        await handleCreateTaskIntent(supabase, userId, userMessage, cards, parts);
      } catch (taskError) {
        console.error('[Secretary API] タスク作成エラー:', taskError);
      }
    }

    // タスク進行 → タスク選択 + AI相談
    if (intent === 'task_progress') {
      try {
        await handleTaskProgressIntent(supabase, userId, userMessage, tasks, cards, parts);
      } catch (taskError) {
        console.error('[Secretary API] タスク進行エラー:', taskError);
      }
    }

    // Phase E: タスクに外部資料を取り込み
    if (intent === 'task_external_resource') {
      try {
        // 進行中または構想中のタスク一覧を表示して、取り込み先を選択させる
        const activeTasks = tasks.filter(t => ['todo', 'in_progress'].includes(t.status));
        if (activeTasks.length === 0) {
          parts.push('\n\n【情報】現在、外部資料を取り込めるアクティブなタスクがありません。先にタスクを作成してください。');
        } else {
          cards.push({
            type: 'task_external_resource',
            data: {
              tasks: activeTasks.map(t => ({
                id: t.id,
                title: t.title,
                status: t.status,
                phase: t.phase,
                projectId: t.project_id,
              })),
              message: '外部資料を取り込むタスクを選んでください。タスク詳細画面の「📚 外部資料 → + 取り込み」から追加できます。',
            },
          });
          parts.push('\n\n外部AI（Deep Research等）の成果物をタスクに取り込んで、壁打ちに活用できます。以下のタスクから取り込み先を選んでください。');
        }
      } catch (extError) {
        console.error('[Secretary API] 外部資料intent エラー:', extError);
        parts.push('\n\n外部資料の取り込み準備中にエラーが発生しました。');
      }
    }

    // Phase 56c: タスク修正提案・調整
    if (intent === 'task_negotiation') {
      try {
        // 提案中タスク一覧を取得
        const proposedTasks = tasks.filter(t => t.status === 'proposed');

        if (proposedTasks.length === 0) {
          parts.push('\n\n【情報】現在、提案中（修正可能）のタスクはありません。');
        } else {
          // Claude APIでユーザーメッセージからタスクを特定＋修正内容を抽出
          const taskListForAI = proposedTasks.map((t, i) => `${i + 1}. [${t.id}] ${t.title}（優先度: ${t.priority}${t.due_date ? `, 期限: ${t.due_date}` : ''}）`).join('\n');

          let matchedTask: TaskRow | null = null;
          let changeType = 'other';
          let proposedValue = '';
          let reason = '';
          let requesterName = '';

          const apiKey = process.env.ANTHROPIC_API_KEY;
          if (apiKey) {
            try {
              const Anthropic = (await import('@anthropic-ai/sdk')).default;
              const anthropic = new Anthropic({ apiKey });
              const aiResp = await anthropic.messages.create({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 512,
                messages: [{
                  role: 'user',
                  content: `以下のタスク一覧とユーザーメッセージから、修正対象タスクと修正内容を特定してください。

【提案中タスク一覧】
${taskListForAI}

【ユーザーメッセージ】
${userMessage}

JSON形式で回答:
{
  "taskIndex": 1から始まるインデックス（特定できない場合は0）,
  "changeType": "deadline" | "priority" | "content" | "reassign" | "other",
  "proposedValue": "具体的な変更希望値（例: 2026-03-15, high, 新しい説明文 等）",
  "reason": "変更理由（推定）",
  "requesterName": "メッセージ中で誰からの希望か特定できれば名前、不明なら空文字"
}`,
                }],
              });

              const aiText = aiResp.content[0].type === 'text' ? aiResp.content[0].text : '';
              const jsonMatch = aiText.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                const idx = (parsed.taskIndex || 0) - 1;
                if (idx >= 0 && idx < proposedTasks.length) {
                  matchedTask = proposedTasks[idx];
                }
                changeType = parsed.changeType || 'other';
                proposedValue = parsed.proposedValue || '';
                reason = parsed.reason || '';
                requesterName = parsed.requesterName || '';
              }
            } catch (aiErr) {
              console.error('[Secretary API] タスク修正AI解析エラー:', aiErr);
            }
          }

          // タスクが特定できなかった場合、1件ならそれを使う
          if (!matchedTask && proposedTasks.length === 1) {
            matchedTask = proposedTasks[0];
          }

          if (matchedTask && proposedValue) {
            // 修正リクエストを登録
            const { TaskNegotiationService } = await import('@/services/task/taskNegotiation.service');
            const request = await TaskNegotiationService.createRequest(matchedTask.id, userId, {
              requesterName: requesterName || 'ユーザー',
              changeType: changeType as 'deadline' | 'priority' | 'content' | 'reassign' | 'other',
              proposedValue,
              reason: reason || undefined,
            });

            if (request) {
              // 交渉状態を取得してカード生成
              const status = await TaskNegotiationService.getNegotiationStatus(matchedTask.id);
              cards.push({
                type: 'task_negotiation',
                data: {
                  taskId: matchedTask.id,
                  taskTitle: matchedTask.title,
                  taskPriority: matchedTask.priority,
                  taskDueDate: matchedTask.due_date,
                  pendingRequests: status.pendingRequests.map(r => ({
                    id: r.id,
                    requesterName: r.requesterName,
                    changeType: r.changeType,
                    proposedValue: r.proposedValue,
                    reason: r.reason,
                    currentValue: r.currentValue,
                  })),
                  pendingCount: status.pendingCount,
                },
              });
              parts.push(`\n\n修正提案を記録しました（タスク: ${matchedTask.title}）。現在${status.pendingCount}件の修正希望があります。AI調整案を生成できます。`);
            }
          } else if (matchedTask) {
            // タスクは特定できたが修正値が不明 → 修正希望の入力を促すカード
            const { TaskNegotiationService } = await import('@/services/task/taskNegotiation.service');
            const status = await TaskNegotiationService.getNegotiationStatus(matchedTask.id);
            cards.push({
              type: 'task_negotiation',
              data: {
                taskId: matchedTask.id,
                taskTitle: matchedTask.title,
                taskPriority: matchedTask.priority,
                taskDueDate: matchedTask.due_date,
                pendingRequests: status.pendingRequests.map(r => ({
                  id: r.id,
                  requesterName: r.requesterName,
                  changeType: r.changeType,
                  proposedValue: r.proposedValue,
                  reason: r.reason,
                  currentValue: r.currentValue,
                })),
                pendingCount: status.pendingCount,
              },
            });
            parts.push(`\n\nタスク「${matchedTask.title}」の修正提案状況です。${status.pendingCount > 0 ? `${status.pendingCount}件の修正希望があります。AI調整案を生成できます。` : '修正希望を追加するには、具体的な変更内容を教えてください。'}`);
          } else {
            // タスク特定できず
            parts.push(`\n\n修正対象のタスクを特定できませんでした。提案中のタスクは以下です:\n${taskListForAI}\n\n具体的なタスク名と修正内容を教えてください。`);
          }
        }
      } catch (negoError) {
        console.error('[Secretary API] タスク修正提案エラー:', negoError);
      }
    }

    // Phase 51b: 傾向分析 → 過去7日の活動サマリーをコンテキストに追加
    if (intent === 'pattern_analysis') {
      try {
        const sevenDaysAgo51 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        // 完了タスク数
        const { count: doneCount } = await supabase
          .from('business_events')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('event_type', 'task_archive')
          .gte('created_at', sevenDaysAgo51);

        // ビジネスイベント数
        const { count: eventCount } = await supabase
          .from('business_events')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .gte('created_at', sevenDaysAgo51);

        // 受信メッセージ数
        const { count: msgCount } = await supabase
          .from('inbox_messages')
          .select('*', { count: 'exact', head: true })
          .eq('direction', 'received')
          .gte('created_at', sevenDaysAgo51);

        // 頻出キーワード（最近のthought_task_nodes）
        let topKeywords: string[] = [];
        try {
          const { data: recentNodes } = await supabase
            .from('thought_task_nodes')
            .select('node_id, knowledge_master_entries!inner(label)')
            .eq('user_id', userId)
            .gte('created_at', sevenDaysAgo51)
            .limit(50);
          if (recentNodes && recentNodes.length > 0) {
            const kwCounts: Record<string, number> = {};
            for (const n of recentNodes) {
              const label = (n as any).knowledge_master_entries?.label || '';
              if (label) kwCounts[label] = (kwCounts[label] || 0) + 1;
            }
            topKeywords = Object.entries(kwCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([k, v]) => `${k}(${v}回)`);
          }
        } catch { /* ignore */ }

        parts.push(`\n\n【過去7日間の活動サマリー】
- 完了タスク: ${doneCount || 0}件
- ビジネスイベント: ${eventCount || 0}件
- 受信メッセージ: ${msgCount || 0}件
- 進行中タスク: ${tasks.filter(t => t.status !== 'done').length}件
- 未処理ジョブ: ${jobs.filter(j => j.status === 'pending').length}件
${topKeywords.length > 0 ? `- 頻出キーワード: ${topKeywords.join(', ')}` : ''}`);
      } catch (patErr) {
        console.error('[Secretary API] 傾向分析エラー:', patErr);
      }
    }

    // Phase 51b: 過去知見の再利用 → ナレッジノードから関連タスク検索
    if (intent === 'knowledge_reuse') {
      try {
        // ユーザーメッセージからキーワードを抽出して検索
        const searchTerms = userMessage
          .replace(/[前回この前以前あの時の方法で同じように似たような]/g, '')
          .trim()
          .slice(0, 50);

        if (searchTerms.length > 2) {
          // ナレッジマスタでラベル部分一致検索
          const { data: matchedEntries } = await supabase
            .from('knowledge_master_entries')
            .select('id, label')
            .ilike('label', `%${searchTerms.slice(0, 20)}%`)
            .limit(5);

          if (matchedEntries && matchedEntries.length > 0) {
            const entryIds = matchedEntries.map((e: { id: string }) => e.id);
            const { data: linkedTasks } = await supabase
              .from('thought_task_nodes')
              .select('task_id, tasks!inner(id, title, status, phase)')
              .in('node_id', entryIds)
              .eq('user_id', userId)
              .limit(10);

            if (linkedTasks && linkedTasks.length > 0) {
              const uniqueTasks = new Map();
              for (const lt of linkedTasks) {
                const t = (lt as any).tasks;
                if (t && !uniqueTasks.has(t.id)) uniqueTasks.set(t.id, t);
              }
              const taskLines = Array.from(uniqueTasks.values()).map((t: any) =>
                `- ${t.title}（${t.status}/${t.phase}）`
              );
              parts.push(`\n\n【関連する過去の知見】\nキーワード「${matchedEntries.map((e: { label: string }) => e.label).join('、')}」に関連:\n${taskLines.join('\n')}`);
            }
          }
        }
      } catch (krErr) {
        console.error('[Secretary API] 知見再利用エラー:', krErr);
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
    // ========================================
    // Phase 51b: 秘書AIコンテキスト拡張（ブリーフィング時に追加データ）
    // ========================================
    if (intent === 'briefing' || intent === 'general') {
      try {
        const extendedParts: string[] = [];
        const now51 = new Date();
        const threeDaysAgo = new Date(now51.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
        const sevenDaysAgo = new Date(now51.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

        // 1. 停滞タスク（3日以上更新なし、未完了）
        const stagnantTasks = tasks.filter(t =>
          t.status !== 'done' && t.updated_at && t.updated_at < threeDaysAgo
        );
        if (stagnantTasks.length > 0) {
          const stagnantLines = stagnantTasks.slice(0, 5).map(t => {
            const daysSince = Math.floor((now51.getTime() - new Date(t.updated_at).getTime()) / 86400000);
            return `- ${t.title}（${daysSince}日間更新なし）`;
          });
          extendedParts.push(`\n\n【⚠️ 停滞タスク（${stagnantTasks.length}件）】\n${stagnantLines.join('\n')}`);
        }

        // 2. 最近完了タスク（7日以内にbusiness_eventsに記録されたもの）
        try {
          const { data: recentArchived } = await supabase
            .from('business_events')
            .select('title, created_at, project_id')
            .eq('user_id', userId)
            .eq('event_type', 'task_archive')
            .gte('created_at', sevenDaysAgo)
            .order('created_at', { ascending: false })
            .limit(5);
          if (recentArchived && recentArchived.length > 0) {
            const lines = recentArchived.map((e: { title: string; created_at: string }) =>
              `- ${e.title}（${new Date(e.created_at).toLocaleDateString('ja-JP')}完了）`
            );
            extendedParts.push(`\n\n【✅ 最近の完了（${recentArchived.length}件/7日間）】\n${lines.join('\n')}`);
          }
        } catch { /* ignore */ }

        // 3. 未返信メッセージ（2日以上前の未読メッセージ）
        const twoDaysAgo = new Date(now51.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
        const unrepliedMessages = messages.filter(m =>
          !m.is_read && m.created_at < twoDaysAgo
        );
        if (unrepliedMessages.length > 0) {
          const unrepliedLines = unrepliedMessages.slice(0, 5).map(m => {
            const daysSince = Math.floor((now51.getTime() - new Date(m.created_at).getTime()) / 86400000);
            return `- ${m.from_name || m.from_address}さんから（${daysSince}日前）: ${(m.subject || m.body || '').slice(0, 40)}`;
          });
          extendedParts.push(`\n\n【📨 未返信（${unrepliedMessages.length}件、2日超）】\n${unrepliedLines.join('\n')}`);
        }

        // 4. プロジェクト勢い（7日間のビジネスイベント数）
        try {
          const { data: projectActivity } = await supabase
            .from('business_events')
            .select('project_id, projects!inner(name)')
            .eq('user_id', userId)
            .gte('created_at', sevenDaysAgo)
            .not('project_id', 'is', null);

          if (projectActivity && projectActivity.length > 0) {
            const counts: Record<string, { name: string; count: number }> = {};
            for (const ev of projectActivity) {
              const pid = ev.project_id;
              const pname = (ev as any).projects?.name || pid;
              if (!counts[pid]) counts[pid] = { name: pname, count: 0 };
              counts[pid].count++;
            }
            const sorted = Object.values(counts).sort((a, b) => b.count - a.count);
            if (sorted.length > 0) {
              const actLines = sorted.slice(0, 5).map(p =>
                `- ${p.name}: ${p.count}件${p.count >= 5 ? '（活発）' : p.count <= 1 ? '（停滞気味）' : ''}`
              );
              extendedParts.push(`\n\n【📊 プロジェクト活動（7日間）】\n${actLines.join('\n')}`);
            }
          }
        } catch { /* ignore */ }

        // 5. 失敗ジョブ（7日以内）
        const failedJobs = jobs.filter(j =>
          j.status === 'failed' && j.created_at && j.created_at > sevenDaysAgo
        );
        if (failedJobs.length > 0) {
          const failLines = failedJobs.slice(0, 3).map(j => `- ${j.title}`);
          extendedParts.push(`\n\n【❌ 失敗ジョブ（${failedJobs.length}件）】\n${failLines.join('\n')}`);
        }

        if (extendedParts.length > 0) {
          parts.push('\n\n--- あなたが気づくべき文脈 ---');
          parts.push(...extendedParts);
        }
      } catch (extErr) {
        console.error('[Secretary API] Phase 51b コンテキスト拡張エラー:', extErr);
      }
    }

    // ========================================
    // Phase 53c: コンタクト作成 → インラインフォームカード
    // ========================================
    if (intent === 'create_contact') {
      try {
        // 組織一覧を取得（コンタクト紐づけ用）
        const { data: orgs } = await supabase
          .from('organizations')
          .select('id, name')
          .eq('user_id', userId)
          .order('name');

        // ユーザーメッセージから名前を推定
        let suggestedName = '';
        const nameMatch = userMessage.match(/[「『](.+?)[」』]/);
        if (nameMatch) {
          suggestedName = nameMatch[1];
        } else {
          const personMatch = userMessage.match(/(.+?)(さん|様)(を|の)(登録|追加|コンタクト)/);
          if (personMatch) suggestedName = personMatch[1].trim();
        }

        cards.push({
          type: 'contact_form',
          data: {
            suggestedName,
            organizations: (orgs || []).map((o: { id: string; name: string }) => ({ id: o.id, name: o.name })),
          },
        });
        parts.push('\n\n【コンタクト登録】\nコンタクト登録フォームを表示しました。');
      } catch (err) {
        console.error('[Agent] Contact form error:', err);
        parts.push('\n\nコンタクト登録の準備に失敗しました。');
      }
    }

    // ========================================
    // Phase 53c: コンタクト検索 → 情報表示カード
    // ========================================
    if (intent === 'search_contact') {
      try {
        // ユーザーメッセージから検索キーワードを抽出
        let searchTerm = '';
        const personMatch = userMessage.match(/(.+?)(さん|様)(の|について)/);
        if (personMatch) {
          searchTerm = personMatch[1].trim();
        } else {
          searchTerm = userMessage.replace(/(コンタクト|連絡先|情報|検索|探し|見せて|教えて|の|を)/g, '').trim();
        }

        if (searchTerm.length >= 1) {
          const { data: foundContacts } = await supabase
            .from('contact_persons')
            .select('id, name, company_name, department, relationship_type, notes, email')
            .or(`name.ilike.%${searchTerm}%,company_name.ilike.%${searchTerm}%`)
            .limit(5);

          if (foundContacts && foundContacts.length > 0) {
            // チャネル情報も取得
            const contactIds = foundContacts.map((c: { id: string }) => c.id);
            const { data: channels } = await supabase
              .from('contact_channels')
              .select('contact_id, channel, address')
              .in('contact_id', contactIds);

            const contactLines = foundContacts.map((c: { id: string; name: string; company_name: string | null; department: string | null; relationship_type: string | null }) => {
              const chs = (channels || []).filter((ch: { contact_id: string }) => ch.contact_id === c.id);
              const chStr = chs.map((ch: { channel: string; address: string }) => `${ch.channel}:${ch.address}`).join(', ');
              return `- ${c.name}${c.company_name ? `（${c.company_name}）` : ''}${c.department ? ` ${c.department}` : ''}${chStr ? ` [${chStr}]` : ''}`;
            });
            parts.push(`\n\n【コンタクト検索結果（${foundContacts.length}件）】\n${contactLines.join('\n')}`);

            // コンタクト詳細カードを追加
            cards.push({
              type: 'contact_search_result',
              data: {
                contacts: foundContacts.map((c: { id: string; name: string; company_name: string | null; department: string | null; relationship_type: string | null; notes: string | null }) => ({
                  id: c.id,
                  name: c.name,
                  companyName: c.company_name || '',
                  department: c.department || '',
                  relationshipType: c.relationship_type || '',
                  channels: (channels || []).filter((ch: { contact_id: string }) => ch.contact_id === c.id)
                    .map((ch: { channel: string; address: string }) => ({ channel: ch.channel, address: ch.address })),
                })),
              },
            });
          } else {
            parts.push(`\n\n【コンタクト検索】\n「${searchTerm}」に該当するコンタクトが見つかりませんでした。新しく登録しますか？`);
          }
        }
      } catch (err) {
        console.error('[Agent] Contact search error:', err);
        parts.push('\n\nコンタクト検索に失敗しました。');
      }
    }

    // ========================================
    // Phase 53c: 組織作成（手動）→ インラインフォームカード
    // ========================================
    if (intent === 'create_organization') {
      try {
        cards.push({
          type: 'org_form',
          data: {
            suggestedName: '',
            suggestedDomain: '',
          },
        });
        parts.push('\n\n【組織作成】\n組織作成フォームを表示しました。');
      } catch (err) {
        console.error('[Agent] Org form error:', err);
        parts.push('\n\n組織作成の準備に失敗しました。');
      }
    }

    // ========================================
    // Phase 53c: プロジェクト作成 → インラインフォームカード
    // ========================================
    if (intent === 'create_project') {
      try {
        const { data: orgs } = await supabase
          .from('organizations')
          .select('id, name')
          .eq('user_id', userId)
          .order('name');

        // メッセージからプロジェクト名を推定
        let suggestedName = '';
        const projNameMatch = userMessage.match(/[「『](.+?)[」』]/);
        if (projNameMatch) {
          suggestedName = projNameMatch[1];
        }

        cards.push({
          type: 'project_form',
          data: {
            suggestedName,
            organizations: (orgs || []).map((o: { id: string; name: string }) => ({ id: o.id, name: o.name })),
          },
        });
        parts.push('\n\n【プロジェクト作成】\nプロジェクト作成フォームを表示しました。');
      } catch (err) {
        console.error('[Agent] Project form error:', err);
        parts.push('\n\nプロジェクト作成の準備に失敗しました。');
      }
    }

    // ========================================
    // Phase A: チャンネル→プロジェクト紐づけ
    // ========================================
    if (intent === 'link_channel') {
      try {
        // プロジェクト一覧を取得してカード表示
        const { data: projects } = await supabase
          .from('projects')
          .select('id, name, organization_id')
          .eq('user_id', userId)
          .order('name');

        // メッセージからチャンネル名/IDを推定
        let channelHint = '';
        const channelMatch = userMessage.match(/[「『#](.+?)[」』\s]/);
        if (channelMatch) channelHint = channelMatch[1];

        cards.push({
          type: 'channel_link_form',
          data: {
            channelHint,
            projects: (projects || []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })),
          },
        });
        parts.push('\n\n【チャンネル紐づけ】\nプロジェクトとチャンネルの紐づけフォームを表示しました。Slack/Chatworkのチャンネル・ルームとプロジェクトを紐づけると、メッセージが自動的にプロジェクトに関連付けられます。');
      } catch (err) {
        console.error('[Agent] Channel link form error:', err);
        parts.push('\n\nチャンネル紐づけの準備に失敗しました。');
      }
    }

    // ========================================
    // Phase 52: 組織レコメンド
    // ========================================
    if (intent === 'setup_organization' || intent === 'briefing') {
      try {
        const { OrgRecommendationService } = await import('@/services/analytics/orgRecommendation.service');
        const candidates = await OrgRecommendationService.detectUnregisteredOrgs(userId);

        if (candidates.length > 0) {
          if (intent === 'setup_organization') {
            // 直接リクエスト → カード表示
            cards.push({
              type: 'org_recommendation',
              data: { candidates },
            });
            parts.push(`\n\n【未登録組織候補（${candidates.length}件）】\n` +
              candidates.slice(0, 5).map(c =>
                `- ${c.suggestedName}（${c.domain}）: ${c.contactCount}人, ${c.messageCount}件のやり取り`
              ).join('\n'));
          } else {
            // ブリーフィング → 3件以上ある場合のみ表示（ノイズ防止）
            if (candidates.length >= 2) {
              cards.push({
                type: 'org_recommendation',
                data: { candidates: candidates.slice(0, 5) },
              });
              parts.push(`\n\n【🏢 組織の登録をおすすめ】\n未登録の組織候補が${candidates.length}件あります（${candidates.slice(0, 3).map(c => c.suggestedName).join('、')}）`);
            }
          }
        } else if (intent === 'setup_organization') {
          parts.push('\n\n【組織候補】\n未登録の組織候補は見つかりませんでした。メッセージ履歴が少ない場合は、メッセージが蓄積されると自動検出されます。');
        }
      } catch (orgErr) {
        console.error('[Secretary API] 組織レコメンドエラー:', orgErr);
        if (intent === 'setup_organization') {
          parts.push('\n\n【組織候補】\n組織候補の検出中にエラーが発生しました。');
        }
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

  // メール署名を取得（メールチャネルの場合のみ付与）
  let emailSignature = '';
  try {
    const { getServerUserEmailSignature } = await import('@/lib/serverAuth');
    emailSignature = await getServerUserEmailSignature();
  } catch { /* ignore */ }

  // Phase 62: グループチャネル判定
  const msgMetadata = (targetMsg.metadata || {}) as Record<string, unknown>;
  const isGroupChannel = (targetMsg.channel === 'slack' && !!msgMetadata.slackChannel)
    || (targetMsg.channel === 'chatwork' && !!msgMetadata.chatworkRoomId);

  const draftResult = await generateReplyDraft(unifiedMsg, undefined, {
    contactContext,
    recentMessages,
    threadContext: '',
    isGroupChannel, // Phase 62
  }, emailSignature, userId);

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
// タスク作成ハンドラー
// ========================================
async function handleCreateTaskIntent(
  supabase: SupabaseClient,
  userId: string,
  userMessage: string,
  cards: CardData[],
  parts: string[]
): Promise<void> {
  // プロジェクト一覧を取得
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, organization_id, organizations(name)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('name');

  // AIでメッセージからタスク情報を推定
  let suggestedTitle = '';
  let suggestedDescription = '';
  let suggestedPriority = 'medium';
  let suggestedProjectId = '';

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const projectNames = (projects || []).map((p: { id: string; name: string }) => `${p.id}:${p.name}`).join(', ');
      const parseRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 300,
          messages: [{ role: 'user', content: `ユーザーのメッセージからタスク情報を抽出してください。

メッセージ: "${userMessage}"

プロジェクト一覧（id:名前）: ${projectNames || 'なし'}

以下のJSON形式で返してください（他のテキストは不要）:
{"title":"タスクのタイトル","description":"タスクの説明（あれば）","priority":"high/medium/low","projectId":"該当プロジェクトのID（なければ空文字）","dueDate":"YYYY-MM-DD（あれば、なければ空文字）"}

ルール:
- タイトルは簡潔に（「タスクを作成して」等の指示部分は除く）
- 優先度は文脈から判断（デフォルトはmedium）
- プロジェクトは名前が含まれていれば対応IDを設定` }],
        }),
      });
      const parseData = await parseRes.json();
      const parseText = parseData?.content?.[0]?.text || '';
      const jsonMatch = parseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        suggestedTitle = parsed.title || '';
        suggestedDescription = parsed.description || '';
        suggestedPriority = parsed.priority || 'medium';
        suggestedProjectId = parsed.projectId || '';
      }
    } catch (parseErr) {
      console.error('[Agent] Task parse error:', parseErr);
    }
  }

  // タイトルがAIで取得できなかった場合のフォールバック
  if (!suggestedTitle) {
    const titleMatch = userMessage.match(/[「『](.+?)[」』]/);
    if (titleMatch) {
      suggestedTitle = titleMatch[1];
    } else {
      // 「〇〇をタスクに」パターン
      const actionMatch = userMessage.match(/(.+?)[をの](タスク|作成|追加|登録)/);
      if (actionMatch) {
        suggestedTitle = actionMatch[1].replace(/^(新しい|新規)\s*/, '').trim();
      }
    }
  }

  cards.push({
    type: 'task_form',
    data: {
      suggestedTitle,
      suggestedDescription,
      suggestedPriority,
      suggestedProjectId,
      suggestedDueDate: '',
      projects: (projects || []).map((p: { id: string; name: string; organization_id: string | null; organizations?: { name: string } | null }) => ({
        id: p.id,
        name: p.name,
        organizationName: p.organizations && typeof p.organizations === 'object' && 'name' in p.organizations ? (p.organizations as { name: string }).name : '',
      })),
    },
  });

  parts.push('\n\n【タスク作成】\nタスク作成フォームを表示しました。');
}

// ========================================
// タスク進行ハンドラー
// ========================================
async function handleTaskProgressIntent(
  supabase: SupabaseClient,
  userId: string,
  userMessage: string,
  tasks: TaskRow[],
  cards: CardData[],
  parts: string[]
): Promise<void> {
  const activeTasks = tasks.filter(t => t.status !== 'done');

  if (activeTasks.length === 0) {
    parts.push('\n\n【タスク】\n進行中のタスクはありません。新しいタスクを作成しますか？');
    return;
  }

  // メッセージからタスクを特定
  let matchedTask: TaskRow | null = null;
  for (const t of activeTasks) {
    if (userMessage.includes(t.title) || userMessage.includes(t.title.slice(0, 10))) {
      matchedTask = t;
      break;
    }
  }

  // AIでタスクを推定（マッチしなかった場合）
  if (!matchedTask && activeTasks.length > 0) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        const taskNames = activeTasks.map(t => `${t.id}:${t.title}`).join(', ');
        const parseRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 100,
            messages: [{ role: 'user', content: `ユーザーのメッセージに最も関連するタスクを以下から1つ選んでください。関連がなければ "none" と返してください。タスクIDだけを返してください。\n\nタスク一覧: ${taskNames}\n\nメッセージ: "${userMessage}"` }],
          }),
        });
        const parseData = await parseRes.json();
        const guessedId = (parseData?.content?.[0]?.text || '').trim();
        if (guessedId && guessedId !== 'none') {
          matchedTask = activeTasks.find(t => t.id === guessedId) || null;
        }
      } catch { /* ignore */ }
    }
  }

  if (matchedTask) {
    // 特定のタスクの会話履歴を取得
    let conversations: Array<{ role: string; content: string; timestamp: string }> = [];
    try {
      const { data: convData } = await supabase
        .from('task_conversations')
        .select('role, content, created_at')
        .eq('task_id', matchedTask.id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (convData) {
        conversations = convData.map((c: { role: string; content: string; created_at: string }) => ({
          role: c.role,
          content: c.content.slice(0, 200),
          timestamp: c.created_at,
        }));
      }
    } catch { /* ignore */ }

    // タスク進行カード
    cards.push({
      type: 'task_progress',
      data: {
        id: matchedTask.id,
        title: matchedTask.title,
        status: matchedTask.status,
        phase: matchedTask.phase,
        priority: matchedTask.priority,
        dueDate: matchedTask.due_date,
        recentConversations: conversations.reverse(),
      },
    });

    parts.push(`\n\n【タスク進行】\n「${matchedTask.title}」のタスク進行カードを表示しました。`);
  } else {
    // タスクが特定できない → 一覧から選択
    for (const t of activeTasks.slice(0, 5)) {
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
    parts.push(`\n\n【タスク一覧】\n進行中のタスクが${activeTasks.length}件あります。どのタスクを進めますか？`);
  }
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
function buildSystemPrompt(contextSummary: string, intent: Intent, hasCards: boolean, personalizedContext?: string): string {
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

## あなたの知恵（Phase 51b: 蓄積データの活用）
- データの「気づくべき文脈」セクションがある場合、以下を自然に織り込むこと:
  - 停滞タスク: 「○○が3日間止まっています。何かブロッカーがありますか？」
  - 未返信メッセージ: 「○○さんに2日返信していません。返信の下書きを作りましょうか？」
  - プロジェクト勢い: 活発なプロジェクトは継続を促し、停滞プロジェクトは状況確認を促す
  - 最近の完了: 「先週○○を完了しましたね。その知見を今のタスクにも活かせそうです」
  - 失敗ジョブ: 「送信失敗のジョブがあります。再実行しますか？」
- ブリーフィング以外でも、会話中に関連データがあれば自然に触れること

## あなたの能力
- メッセージの要約・返信下書き
- タスクの作成（「○○のタスクを作成して」で作成フォーム表示）
- タスクの進行支援（「タスクを進めたい」で対話・相談）
- タスクの状況確認・優先度の提案
- ジョブ（簡易作業）の作成と自動実行（返信、日程調整、確認連絡など）
- 承認されたジョブはAIが自動で実行する
- コンタクトの登録（「コンタクトを登録」でフォーム表示）・検索（「○○さんの情報」で検索）
- 組織の作成（「新しい組織を作成」でフォーム表示）・自動検出（「組織を整理」で未登録候補表示）
- プロジェクトの作成（「プロジェクトを作成して」でフォーム表示）
- Google Calendar連携（今日の予定表示・空き時間検索・予定作成）
- Google Drive連携（ドキュメント一覧表示・ファイル検索・共有リンク生成）
- ファイル取り込み管理（受領ファイルのAI自動分類→確認→承認→最終保管フロー）
- ファイル格納指示（「このURLをA社に格納して」→ 確認→ 保存）
- ビジネスログの参照・活動要約の表示
- ビジネスイベント自動蓄積（メッセージ・ドキュメント・会議が時系列で自動記録）
- 週間活動要約（AI生成の週次レポート）
- 思考マップ・ナレッジの参照
- タスク修正提案・調整（「○○のタスクの納期を変更したい」→修正リクエスト記録→AI調整案生成→承認→タスク自動修正）
- チャンネル紐づけ（「このチャンネルをプロジェクトに紐づけて」→ Slack/Chatworkのチャンネルをプロジェクトに関連付け）

## コンタクト・組織・プロジェクトの管理
ユーザーが「コンタクトを登録して」「○○さんを追加」と言ったら:
1. コンタクト登録フォームカードを表示
2. ユーザーが情報を入力して「登録する」を押すとコンタクトが作成される

ユーザーが「○○さんの情報を教えて」と言ったら:
1. コンタクトを検索して結果カードを表示

ユーザーが「新しい組織を作成」「プロジェクトを作成して」と言ったら:
1. 該当するフォームカードを表示して入力→作成の流れ

## タスクの流れ
ユーザーが「タスクを作成して」「○○のタスクを追加」と言ったら:
1. タスク作成フォームカードを表示（タイトル・説明・優先度・プロジェクト・期限）
2. ユーザーが内容を入力して「作成する」を押すとタスクが登録される
3. 「タスクを進めたい」と言えば、進行中のタスクの一覧から選んでAIと対話できる

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
${contextSummary || '（データなし）'}
${personalizedContext || ''}`;
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

    // Phase 53b: 会話履歴を構築（最新30件まで — クライアント側でスマート要約済み）
    const conversationHistory = (history || []).slice(-30).map(
      (msg: { role: string; content: string }) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })
    );
    conversationHistory.push({ role: 'user' as const, content: message });

    // Phase 61: パーソナライズコンテキスト取得
    let personalizedCtx = '';
    try {
      const { buildPersonalizedContext } = await import('@/services/ai/personalizedContext.service');
      personalizedCtx = await buildPersonalizedContext(userId);
    } catch (e) {
      console.error('[Secretary Chat] パーソナライズ取得エラー:', e);
    }

    // Phase A: 伸二メソッド思考プリセット（ビジネス相談・タスク関連intentのみ適用。事務的intentには適用しない）
    const businessIntents: Intent[] = ['task_progress', 'general', 'thought_map', 'knowledge_structuring', 'knowledge_reuse', 'pattern_analysis', 'consultations'];
    if (businessIntents.includes(intent)) {
      try {
        const { getShinjiMethodPrompt } = await import('@/services/ai/personalizedContext.service');
        personalizedCtx += getShinjiMethodPrompt();
      } catch {
        // 取得失敗時は無視
      }
    }

    // システムプロンプト構築
    const systemPrompt = buildSystemPrompt(contextText, intent, cards.length > 0, personalizedCtx);

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
    case 'consultations':
      return hasCards
        ? 'あなた宛ての社内相談があります。内容を確認して回答してください。回答するとAIが返信文面を自動生成します。'
        : '現在あなた宛ての相談はありません。';
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
    case 'knowledge_structuring':
      return hasCards
        ? 'ナレッジ構造化の提案を表示しました。AIが蓄積されたキーワードを分析し、領域/分野の構造を提案しています。内容を確認して「承認」または「却下」してください。'
        : '現在待機中のナレッジ提案はありません。キーワードが十分に蓄積されると、週次で自動的に提案が生成されます。';
    case 'thought_map':
      return '思考マップへのリンクを表示しました。クリックして開いてください。';
    case 'create_business_event':
      return hasCards
        ? 'イベント登録フォームを表示しました。内容を入力して「記録する」を押してください。メッセージの内容からタイトルや種別を推定しています。'
        : 'イベント登録フォームの準備に失敗しました。もう一度お試しください。';
    case 'create_calendar_event':
      return hasCards
        ? 'カレンダーに予定を登録しました。'
        : '予定の作成に失敗しました。日時とタイトルを含めてもう一度お伝えください。';
    case 'create_drive_folder':
      return hasCards
        ? 'Google Driveにフォルダを作成しました。'
        : 'フォルダの作成に失敗しました。フォルダ名を指定してもう一度お伝えください。';
    case 'projects':
      return hasCards
        ? 'プロジェクト一覧を確認しました。ビジネスログ画面で詳細を管理できます。'
        : 'プロジェクトはまだ登録されていません。ビジネスログ画面から新規作成できます。';
    case 'business_log':
      return 'ビジネスログへのリンクを表示しました。クリックして開いてください。';
    case 'create_task':
      return hasCards
        ? 'タスク作成フォームを表示しました。内容を入力して「作成する」を押してください。'
        : 'タスク作成の準備に失敗しました。もう一度お試しください。';
    case 'task_progress':
      return hasCards
        ? 'タスクの詳細を表示しました。このまま相談を続けることもできますし、「続ける」でタスクページに移動もできます。'
        : '進行中のタスクが見つかりませんでした。新しいタスクを作成しますか？';
    case 'create_contact':
      return hasCards
        ? 'コンタクト登録フォームを表示しました。情報を入力して「登録する」を押してください。'
        : 'コンタクト登録の準備に失敗しました。もう一度お試しください。';
    case 'search_contact':
      return hasCards
        ? 'コンタクト情報を検索しました。'
        : 'お探しのコンタクトが見つかりませんでした。新しく登録しますか？';
    case 'create_organization':
      return hasCards
        ? '組織作成フォームを表示しました。情報を入力して「作成する」を押してください。'
        : '組織作成の準備に失敗しました。もう一度お試しください。';
    case 'create_project':
      return hasCards
        ? 'プロジェクト作成フォームを表示しました。情報を入力して「作成する」を押してください。'
        : 'プロジェクト作成の準備に失敗しました。もう一度お試しください。';
    case 'link_channel':
      return hasCards
        ? 'チャンネル紐づけフォームを表示しました。Slack/Chatworkのチャンネルとプロジェクトを選択して紐づけてください。'
        : 'チャンネル紐づけの準備に失敗しました。もう一度お試しください。';
    default:
      return `「${message}」について確認しました。\n\nどのように進めましょうか？`;
  }
}
