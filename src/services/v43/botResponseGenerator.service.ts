// v4.3: チャネルボット — レスポンス生成サービス
// 公開レベルフィルタ + データ取得 + メッセージ生成
// トーン: 当たり障りない（丁寧すぎず、カジュアルすぎず）統一表現

import { getServerSupabase, getSupabase } from '@/lib/supabase';
import type { BotIntent } from './botIntentClassifier.service';

// ========================================
// 型定義
// ========================================

type RelationshipType = 'internal' | 'client' | 'partner';

interface BotResponse {
  text: string;
  intent: BotIntent;
  // Slack Block Kit用（メニューカード等）。nullならテキストのみ
  slackBlocks?: Record<string, unknown>[];
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

/**
 * 社外チャネル用のメニュー項目フィルタ
 */
function getMenuItems(relType: RelationshipType): { id: string; label: string; emoji: string }[] {
  const allItems = [
    { id: 'nm_menu_issues', label: '未確定事項', emoji: '📋' },
    { id: 'nm_menu_decisions', label: '決定事項', emoji: '📌' },
    { id: 'nm_menu_tasks', label: 'タスク状況', emoji: '✅' },
    { id: 'nm_menu_agenda', label: '次回アジェンダ', emoji: '📅' },
    { id: 'nm_menu_summary', label: '今週のまとめ', emoji: '📊' },
  ];

  if (relType !== 'internal') {
    // 社外: open_issues を除外
    return allItems.filter(item => item.id !== 'nm_menu_issues');
  }
  return allItems;
}

// ========================================
// プロジェクト → 組織 → relationship_type 取得
// ========================================

export async function getRelationshipTypeForProject(projectId: string): Promise<RelationshipType> {
  return getRelationshipType(projectId);
}

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
// プロジェクト名取得
// ========================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getProjectName(supabase: any, projectId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .single();
    return data?.name || 'プロジェクト';
  } catch {
    return 'プロジェクト';
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
  if (!supabase) return { text: 'データベースへの接続に失敗しました。しばらくしてからお試しください。', intent };

  // 公開レベルチェック
  const relType = await getRelationshipType(projectId);
  if (!isIntentAllowed(intent, relType)) {
    return {
      text: 'この情報はこちらのチャネルではお伝えできません。NodeMap上でご確認ください。',
      intent,
    };
  }

  // プロジェクト名を取得（応答にPJ名を含めて読み込み結果であることを明示）
  const projectName = await getProjectName(supabase, projectId);

  try {
    switch (intent) {
      case 'bot_issues':
        return await generateIssuesResponse(supabase, projectId, projectName);

      case 'bot_decisions':
        return await generateDecisionsResponse(supabase, projectId, projectName);

      case 'bot_tasks':
        return await generateTasksResponse(supabase, projectId, projectName);

      case 'bot_agenda':
        return await generateAgendaResponse(supabase, projectId, projectName);

      case 'bot_summary':
        return await generateSummaryResponse(supabase, projectId, projectName);

      case 'bot_menu':
        return generateMenuResponse(projectId, relType);

      case 'bot_help':
        return generateHelpResponse(nodeMapBaseUrl);

      default:
        return generateHelpResponse(nodeMapBaseUrl);
    }
  } catch (err) {
    console.error(`[BotResponse] エラー (${intent}):`, err);
    return { text: 'データの取得中にエラーが発生しました。しばらくしてからお試しください。', intent };
  }
}

// ========================================
// メニューカード（Slack Block Kit対応）
// ========================================

function generateMenuResponse(projectId: string, relType: RelationshipType): BotResponse {
  const items = getMenuItems(relType);

  // Slack Block Kit用のボタン付きカード
  const slackBlocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'プロジェクトの情報をお伝えできます。\n確認したい項目を選んでください。',
      },
    },
    {
      type: 'actions',
      elements: items.map(item => ({
        type: 'button',
        text: {
          type: 'plain_text',
          text: `${item.emoji} ${item.label}`,
          emoji: true,
        },
        action_id: `${item.id}_${projectId}`,
        value: projectId,
      })),
    },
  ];

  // Chatwork等のテキスト（番号選択式）
  const textLines = [
    'プロジェクトの情報をお伝えできます。',
    '番号をメンションで送ってください。',
    '',
    ...items.map((item, i) => `[${i + 1}] ${item.emoji} ${item.label}`),
    '',
    '例: @NodeMap 1',
  ];

  return {
    text: textLines.join('\n'),
    intent: 'bot_menu',
    slackBlocks,
  };
}

// ========================================
// 各intent用レスポンス生成（トーン統一版）
// ========================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateIssuesResponse(supabase: any, projectId: string, projectName: string): Promise<BotResponse> {
  const { data: issues } = await supabase
    .from('open_issues')
    .select('title, priority_level, days_stagnant, status')
    .eq('project_id', projectId)
    .in('status', ['open', 'stale'])
    .order('priority_score', { ascending: false })
    .limit(10);

  if (!issues || issues.length === 0) {
    return { text: `${projectName} の未確定事項は現在ありません。`, intent: 'bot_issues' };
  }

  const priorityIcon: Record<string, string> = {
    critical: '🔴', high: '🟠', medium: '🟡', low: '⚪',
  };

  const lines = [`${projectName} の未確定事項（${issues.length}件）`, ''];
  for (const issue of issues) {
    const icon = priorityIcon[issue.priority_level] || '⚪';
    const stale = issue.status === 'stale' ? '  ※停滞中' : '';
    lines.push(`${icon} ${issue.title}（${issue.days_stagnant}日経過${stale}）`);
  }

  return { text: lines.join('\n'), intent: 'bot_issues' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateDecisionsResponse(supabase: any, projectId: string, projectName: string): Promise<BotResponse> {
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
    return { text: `${projectName} の直近2週間で新しい決定事項はありません。`, intent: 'bot_decisions' };
  }

  const statusIcon: Record<string, string> = {
    pending: '⏳', in_progress: '🔄', completed: '✅', blocked: '🚫',
  };

  const lines = [`${projectName} の決定事項 - 直近2週間（${decisions.length}件）`, ''];
  for (const d of decisions) {
    const icon = statusIcon[d.implementation_status] || '⏳';
    const date = new Date(d.created_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
    lines.push(`${icon} ${d.title}（${date}）`);
    if (d.decision_content) {
      lines.push(`    ${d.decision_content.substring(0, 80)}${d.decision_content.length > 80 ? '...' : ''}`);
    }
  }

  return { text: lines.join('\n'), intent: 'bot_decisions' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateTasksResponse(supabase: any, projectId: string, projectName: string): Promise<BotResponse> {
  // assigned_contact_id → contact_persons.name を結合して担当者名を取得
  const { data: tasks } = await supabase
    .from('tasks')
    .select('title, status, due_date, assigned_contact_id, contact_persons:assigned_contact_id(name)')
    .eq('project_id', projectId)
    .in('status', ['todo', 'in_progress'])
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(20);

  if (!tasks || tasks.length === 0) {
    return { text: `${projectName} に進行中のタスクはありません。`, intent: 'bot_tasks' };
  }

  const statusIcon: Record<string, string> = {
    todo: '📝', in_progress: '🔄',
  };

  // 担当者でグルーピング
  const byAssignee = new Map<string, typeof tasks>();
  for (const task of tasks) {
    const assigneeName = (task.contact_persons as { name: string } | null)?.name || '未割当';
    if (!byAssignee.has(assigneeName)) {
      byAssignee.set(assigneeName, []);
    }
    byAssignee.get(assigneeName)!.push(task);
  }

  const lines = [`${projectName} のタスク状況（${tasks.length}件）`, ''];
  const today = new Date();

  for (const [assignee, assigneeTasks] of byAssignee) {
    lines.push(`■ ${assignee}`);
    for (const task of assigneeTasks) {
      const icon = statusIcon[task.status] || '📝';
      let dueLine = '';
      if (task.due_date) {
        const dueDate = new Date(task.due_date);
        const isOverdue = dueDate < today;
        dueLine = isOverdue
          ? `  ※期限超過（${dueDate.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}）`
          : ` 〜${dueDate.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}`;
      }
      lines.push(`  ${icon} ${task.title}${dueLine}`);
    }
    lines.push('');
  }

  return { text: lines.join('\n').trimEnd(), intent: 'bot_tasks' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateAgendaResponse(supabase: any, projectId: string, projectName: string): Promise<BotResponse> {
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
    return { text: `${projectName} の直近で予定されているアジェンダはありません。`, intent: 'bot_agenda' };
  }

  const typeLabel: Record<string, string> = {
    open_issue: '未確定事項', decision_review: '決定確認', task_progress: 'タスク進捗',
    task_completed: '成果報告', custom: 'その他',
  };

  const date = new Date(agenda.meeting_date).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
  const lines = [`${projectName}｜${date}のアジェンダ`, ''];

  const items = agenda.items || [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as { type: string; title: string; estimated_minutes: number };
    const label = typeLabel[item.type] || item.type;
    lines.push(`${i + 1}. [${label}] ${item.title}（${item.estimated_minutes}分）`);
  }

  const totalMin = items.reduce((sum: number, item: { estimated_minutes: number }) => sum + (item.estimated_minutes || 0), 0);
  lines.push(`\n想定時間: 約${totalMin}分`);

  return { text: lines.join('\n'), intent: 'bot_agenda' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateSummaryResponse(supabase: any, projectId: string, projectName: string): Promise<BotResponse> {
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

  const lines = [`${projectName} の今週のまとめ`, ''];

  if (completedTasks && completedTasks.length > 0) {
    lines.push(`完了タスク: ${completedTasks.length}件`);
    for (const t of completedTasks.slice(0, 5)) {
      lines.push(`  ・${t.title}`);
    }
    if (completedTasks.length > 5) lines.push(`  ...他${completedTasks.length - 5}件`);
  } else {
    lines.push('完了タスク: なし');
  }

  if (newDecisions && newDecisions.length > 0) {
    lines.push(`\n新規決定: ${newDecisions.length}件`);
    for (const d of newDecisions) {
      lines.push(`  ・${d.title}`);
    }
  }

  lines.push(`\n残タスク: ${remainingCount || 0}件`);

  return { text: lines.join('\n'), intent: 'bot_summary' };
}

function generateHelpResponse(baseUrl: string): BotResponse {
  const lines = [
    'NodeMap ボットの使い方',
    '',
    'メンションで話しかけると、プロジェクトの情報をお伝えします。',
    '',
    '📋 未確定事項 → 「課題は？」「決まってないことは？」',
    '📌 決定事項 → 「何が決まった？」「決定事項を教えて」',
    '✅ タスク状況 → 「進捗は？」「タスクどうなってる？」',
    '📅 アジェンダ → 「次の会議は？」「議題を教えて」',
    '📊 まとめ → 「今週どうだった？」「振り返り」',
    '',
    '「メニュー」と送るとボタンで選べます。',
    `詳細はNodeMapで: ${baseUrl}`,
  ];

  return { text: lines.join('\n'), intent: 'bot_help' };
}
