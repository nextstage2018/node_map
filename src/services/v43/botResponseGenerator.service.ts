// v4.3: チャネルボット — レスポンス生成サービス
// 公開レベルフィルタ + データ取得 + メッセージ生成

import { getServerSupabase, getSupabase } from '@/lib/supabase';
import type { BotIntent } from './botIntentClassifier.service';

// ========================================
// 型定義
// ========================================

type RelationshipType = 'internal' | 'client' | 'partner';

interface BotResponse {
  text: string;
  intent: BotIntent;
}

// ========================================
// 公開レベルフィルタ
// ========================================

/**
 * intentが公開可能かチェック
 * internal → すべて公開
 * client/partner → open_issues は非公開
 */
function isIntentAllowed(intent: BotIntent, relType: RelationshipType): boolean {
  if (relType === 'internal') return true;

  // client/partner では open_issues（社内の迷い）は非公開
  if (intent === 'bot_issues') return false;

  return true;
}

// ========================================
// プロジェクト → 組織 → relationship_type 取得
// ========================================

async function getRelationshipType(projectId: string): Promise<RelationshipType> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return 'client'; // 安全側に倒す

  try {
    const { data: project } = await supabase
      .from('projects')
      .select('organization_id')
      .eq('id', projectId)
      .single();

    if (!project?.organization_id) return 'internal';

    const { data: org } = await supabase
      .from('organizations')
      .select('relationship_type')
      .eq('id', project.organization_id)
      .single();

    return (org?.relationship_type as RelationshipType) || 'internal';
  } catch {
    return 'internal';
  }
}

// ========================================
// データ取得 + レスポンス生成
// ========================================

export async function generateBotResponse(
  projectId: string,
  intent: BotIntent,
  nodeMapBaseUrl: string
): Promise<BotResponse> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return { text: 'データベースに接続できません', intent };

  // 公開レベルチェック
  const relType = await getRelationshipType(projectId);
  if (!isIntentAllowed(intent, relType)) {
    return {
      text: 'この情報は社内チャネルでのみ確認できます。',
      intent,
    };
  }

  try {
    switch (intent) {
      case 'bot_issues':
        return await generateIssuesResponse(supabase, projectId);

      case 'bot_decisions':
        return await generateDecisionsResponse(supabase, projectId);

      case 'bot_tasks':
        return await generateTasksResponse(supabase, projectId);

      case 'bot_agenda':
        return await generateAgendaResponse(supabase, projectId);

      case 'bot_summary':
        return await generateSummaryResponse(supabase, projectId);

      case 'bot_help':
        return generateHelpResponse(nodeMapBaseUrl);

      default:
        return generateHelpResponse(nodeMapBaseUrl);
    }
  } catch (err) {
    console.error(`[BotResponse] エラー (${intent}):`, err);
    return { text: 'データの取得中にエラーが発生しました。', intent };
  }
}

// ========================================
// 各intent用レスポンス生成
// ========================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateIssuesResponse(supabase: any, projectId: string): Promise<BotResponse> {
  const { data: issues } = await supabase
    .from('open_issues')
    .select('title, priority_level, days_stagnant, status')
    .eq('project_id', projectId)
    .in('status', ['open', 'stale'])
    .order('priority_score', { ascending: false })
    .limit(10);

  if (!issues || issues.length === 0) {
    return { text: '未確定事項はありません。', intent: 'bot_issues' };
  }

  const priorityIcon: Record<string, string> = {
    critical: '🔴', high: '🟠', medium: '🟡', low: '⚪',
  };

  const lines = ['📋 **未確定事項**\n'];
  for (const issue of issues) {
    const icon = priorityIcon[issue.priority_level] || '⚪';
    const stale = issue.status === 'stale' ? ' ⚠️停滞' : '';
    lines.push(`${icon} ${issue.title}（${issue.days_stagnant}日経過${stale}）`);
  }

  return { text: lines.join('\n'), intent: 'bot_issues' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateDecisionsResponse(supabase: any, projectId: string): Promise<BotResponse> {
  const weekAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: decisions } = await supabase
    .from('decision_log')
    .select('title, decision_content, implementation_status, created_at')
    .eq('project_id', projectId)
    .eq('status', 'active')
    .gte('created_at', weekAgo)
    .order('created_at', { ascending: false })
    .limit(10);

  if (!decisions || decisions.length === 0) {
    return { text: '直近2週間の決定事項はありません。', intent: 'bot_decisions' };
  }

  const statusIcon: Record<string, string> = {
    pending: '⏳', in_progress: '🔄', completed: '✅', blocked: '🚫',
  };

  const lines = ['📌 **決定事項（直近2週間）**\n'];
  for (const d of decisions) {
    const icon = statusIcon[d.implementation_status] || '⏳';
    const date = new Date(d.created_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
    lines.push(`${icon} ${d.title}（${date}）`);
    if (d.decision_content) {
      lines.push(`   → ${d.decision_content.substring(0, 60)}${d.decision_content.length > 60 ? '...' : ''}`);
    }
  }

  return { text: lines.join('\n'), intent: 'bot_decisions' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateTasksResponse(supabase: any, projectId: string): Promise<BotResponse> {
  const { data: tasks } = await supabase
    .from('tasks')
    .select('title, status, due_date, assigned_to')
    .eq('project_id', projectId)
    .in('status', ['todo', 'in_progress'])
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(15);

  if (!tasks || tasks.length === 0) {
    return { text: '進行中のタスクはありません。', intent: 'bot_tasks' };
  }

  const statusIcon: Record<string, string> = {
    todo: '📝', in_progress: '🔄',
  };

  const lines = ['✅ **タスク状況**\n'];
  const today = new Date();

  for (const task of tasks) {
    const icon = statusIcon[task.status] || '📝';
    let dueLine = '';
    if (task.due_date) {
      const dueDate = new Date(task.due_date);
      const isOverdue = dueDate < today;
      dueLine = isOverdue
        ? ` ⚠️期限超過(${dueDate.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })})`
        : ` 〜${dueDate.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}`;
    }
    lines.push(`${icon} ${task.title}${dueLine}`);
  }

  return { text: lines.join('\n'), intent: 'bot_tasks' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateAgendaResponse(supabase: any, projectId: string): Promise<BotResponse> {
  // 今日以降の最新アジェンダを取得
  const todayStr = new Date().toISOString().split('T')[0];

  const { data: agenda } = await supabase
    .from('meeting_agenda')
    .select('meeting_date, title, items, status')
    .eq('project_id', projectId)
    .gte('meeting_date', todayStr)
    .order('meeting_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!agenda) {
    return { text: '直近のアジェンダはありません。', intent: 'bot_agenda' };
  }

  const typeLabel: Record<string, string> = {
    open_issue: '未確定事項', decision_review: '決定確認', task_progress: 'タスク進捗',
    task_completed: '成果報告', custom: 'その他',
  };

  const date = new Date(agenda.meeting_date).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
  const lines = [`📅 **${date}のアジェンダ**\n`];

  const items = agenda.items || [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as { type: string; title: string; estimated_minutes: number };
    const label = typeLabel[item.type] || item.type;
    lines.push(`${i + 1}. [${label}] ${item.title}（${item.estimated_minutes}分）`);
  }

  const totalMin = items.reduce((sum: number, item: { estimated_minutes: number }) => sum + (item.estimated_minutes || 0), 0);
  lines.push(`\n合計: 約${totalMin}分`);

  return { text: lines.join('\n'), intent: 'bot_agenda' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateSummaryResponse(supabase: any, projectId: string): Promise<BotResponse> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 完了タスク
  const { data: completedTasks } = await supabase
    .from('tasks')
    .select('title')
    .eq('project_id', projectId)
    .eq('status', 'done')
    .gte('updated_at', weekAgo)
    .limit(10);

  // 新規決定事項
  const { data: newDecisions } = await supabase
    .from('decision_log')
    .select('title')
    .eq('project_id', projectId)
    .eq('status', 'active')
    .gte('created_at', weekAgo)
    .limit(5);

  // 残タスク数
  const { count: remainingCount } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .in('status', ['todo', 'in_progress']);

  const lines = ['📊 **今週のまとめ**\n'];

  if (completedTasks && completedTasks.length > 0) {
    lines.push(`✅ 完了タスク: ${completedTasks.length}件`);
    for (const t of completedTasks.slice(0, 5)) {
      lines.push(`   ・${t.title}`);
    }
    if (completedTasks.length > 5) lines.push(`   ...他${completedTasks.length - 5}件`);
  } else {
    lines.push('✅ 完了タスク: なし');
  }

  if (newDecisions && newDecisions.length > 0) {
    lines.push(`\n📌 新規決定: ${newDecisions.length}件`);
    for (const d of newDecisions) {
      lines.push(`   ・${d.title}`);
    }
  }

  lines.push(`\n📝 残タスク: ${remainingCount || 0}件`);

  return { text: lines.join('\n'), intent: 'bot_summary' };
}

function generateHelpResponse(baseUrl: string): BotResponse {
  const lines = [
    '🤖 **NodeMap ボット**\n',
    '以下のキーワードでメンションしてください:\n',
    '📋 **課題** / **未確定事項** → 未確定事項リスト',
    '📌 **決定** / **決まったこと** → 決定事項',
    '✅ **タスク** / **進捗** → タスク状況',
    '📅 **アジェンダ** / **次の会議** → 次回アジェンダ',
    '📊 **まとめ** / **今週** → 週次サマリー',
    '❓ **ヘルプ** → この案内',
    `\n💡 変更操作はNodeMapから: ${baseUrl}`,
  ];

  return { text: lines.join('\n'), intent: 'bot_help' };
}
