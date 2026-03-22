// v4.4: チャネルボット — 定期配信用メッセージフォーマッタ
// relationship_type で配信内容を分岐

import { getServerSupabase, getSupabase } from '@/lib/supabase';
import { getTodayJST, addDaysJST } from '@/lib/dateUtils';

// ========================================
// 型定義
// ========================================

type RelationshipType = 'internal' | 'client' | 'partner';

interface ProjectChannel {
  project_id: string;
  service_name: 'slack' | 'chatwork' | 'email';
  identifier: string;  // Slack channelId / Chatwork roomId
  project_name: string;
  relationship_type: RelationshipType;
}

export interface BotDelivery {
  serviceName: 'slack' | 'chatwork';
  channelId: string;
  text: string;
  projectName: string;
}

// ========================================
// 全PJのチャネル情報取得
// ========================================

export async function getAllProjectChannels(): Promise<ProjectChannel[]> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return [];

  try {
    const { data: channels } = await supabase
      .from('project_channels')
      .select('project_id, service_name, channel_identifier')
      .in('service_name', ['slack', 'chatwork']);

    if (!channels || channels.length === 0) return [];

    // プロジェクトID一覧
    const projectIds = [...new Set(channels.map(c => c.project_id))];

    // プロジェクト→組織のrelationship_type取得
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name, organization_id')
      .in('id', projectIds);

    if (!projects) return [];

    const orgIds = [...new Set(projects.map(p => p.organization_id).filter(Boolean))];
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, relationship_type')
      .in('id', orgIds);

    const orgMap = new Map((orgs || []).map(o => [o.id, o.relationship_type as RelationshipType]));
    const projectMap = new Map(projects.map(p => [p.id, {
      name: p.name,
      relType: orgMap.get(p.organization_id) || 'internal',
    }]));

    return channels
      .filter(c => c.service_name === 'slack' || c.service_name === 'chatwork')
      .map(c => ({
        project_id: c.project_id,
        service_name: c.service_name as 'slack' | 'chatwork',
        identifier: c.channel_identifier,
        project_name: projectMap.get(c.project_id)?.name || '不明',
        relationship_type: projectMap.get(c.project_id)?.relType || 'internal',
      }));
  } catch (err) {
    console.error('[BotFormatter] チャネル取得エラー:', err);
    return [];
  }
}

// ========================================
// 月曜ブリーフィング生成
// ========================================

export async function generateWeeklyBriefing(
  projectId: string,
  relType: RelationshipType
): Promise<string> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return '';

  const lines: string[] = ['📋 今週のブリーフィング\n'];

  // 1. 未確定事項（internalのみ）
  if (relType === 'internal') {
    const { data: issues } = await supabase
      .from('open_issues')
      .select('title, priority_level, status')
      .eq('project_id', projectId)
      .in('status', ['open', 'stale'])
      .order('priority_score', { ascending: false })
      .limit(5);

    if (issues && issues.length > 0) {
      lines.push(`⚠️ 未確定事項: ${issues.length}件`);
      for (const i of issues) {
        const stale = i.status === 'stale' ? ' (停滞)' : '';
        lines.push(`  ・${i.title}${stale}`);
      }
      lines.push('');
    }
  }

  // 2. タスク一覧
  const { data: tasks } = await supabase
    .from('tasks')
    .select('title, status, due_date')
    .eq('project_id', projectId)
    .in('status', ['todo', 'in_progress'])
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(10);

  if (tasks && tasks.length > 0) {
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const todo = tasks.filter(t => t.status === 'todo').length;
    lines.push(`✅ タスク: 進行中 ${inProgress}件 / 未着手 ${todo}件`);
    const today = new Date();
    for (const t of tasks.slice(0, 7)) {
      const icon = t.status === 'in_progress' ? '🔄' : '📝';
      let due = '';
      if (t.due_date) {
        const d = new Date(t.due_date);
        const overdue = d < today ? ' ⚠️超過' : '';
        due = ` (〜${d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}${overdue})`;
      }
      lines.push(`  ${icon} ${t.title}${due}`);
    }
    lines.push('');
  }

  // 3. 今週の会議予定（簡易版: meeting_agendaから）
  const todayStr = getTodayJST();
  const weekEndStr = addDaysJST(5);

  const { data: agendas } = await supabase
    .from('meeting_agenda')
    .select('meeting_date, title')
    .eq('project_id', projectId)
    .gte('meeting_date', todayStr)
    .lte('meeting_date', weekEndStr)
    .order('meeting_date', { ascending: true })
    .limit(5);

  if (agendas && agendas.length > 0) {
    lines.push(`📅 今週の会議: ${agendas.length}件`);
    for (const a of agendas) {
      const d = new Date(a.meeting_date);
      lines.push(`  ・${d.toLocaleDateString('ja-JP', { weekday: 'short', month: 'short', day: 'numeric' })} ${a.title}`);
    }
  }

  return lines.join('\n');
}

// ========================================
// 金曜レポート生成
// ========================================

export async function generateWeeklyReport(
  projectId: string,
  relType: RelationshipType
): Promise<string> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return '';

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const lines: string[] = ['📊 今週の成果レポート\n'];

  // 1. 完了タスク
  const { data: completedTasks } = await supabase
    .from('tasks')
    .select('title')
    .eq('project_id', projectId)
    .eq('status', 'done')
    .gte('updated_at', weekAgo)
    .limit(10);

  if (completedTasks && completedTasks.length > 0) {
    lines.push(`✅ 完了タスク: ${completedTasks.length}件`);
    for (const t of completedTasks.slice(0, 5)) {
      lines.push(`  ・${t.title}`);
    }
    if (completedTasks.length > 5) lines.push(`  ...他${completedTasks.length - 5}件`);
    lines.push('');
  } else {
    lines.push('✅ 完了タスク: なし\n');
  }

  // 2. 新規決定事項
  const { data: decisions } = await supabase
    .from('decision_log')
    .select('title')
    .eq('project_id', projectId)
    .eq('status', 'active')
    .gte('created_at', weekAgo)
    .limit(5);

  if (decisions && decisions.length > 0) {
    lines.push(`📌 新規決定: ${decisions.length}件`);
    for (const d of decisions) {
      lines.push(`  ・${d.title}`);
    }
    lines.push('');
  }

  // 3. 新たな未確定事項（internalのみ）
  if (relType === 'internal') {
    const { data: newIssues } = await supabase
      .from('open_issues')
      .select('title')
      .eq('project_id', projectId)
      .gte('created_at', weekAgo)
      .limit(5);

    if (newIssues && newIssues.length > 0) {
      lines.push(`⚠️ 新規未確定事項: ${newIssues.length}件`);
      for (const i of newIssues) {
        lines.push(`  ・${i.title}`);
      }
    }
  }

  return lines.join('\n');
}

// ========================================
// アラート生成
// ========================================

export async function generateAlerts(
  projectId: string,
  relType: RelationshipType
): Promise<string | null> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return null;

  const alerts: string[] = [];
  const today = new Date();
  const todayStr = getTodayJST();

  // 1. stale未確定事項（internalのみ）
  if (relType === 'internal') {
    const { data: staleIssues } = await supabase
      .from('open_issues')
      .select('title, days_stagnant')
      .eq('project_id', projectId)
      .eq('status', 'stale')
      .limit(5);

    if (staleIssues && staleIssues.length > 0) {
      for (const i of staleIssues) {
        alerts.push(`🔴 停滞中: ${i.title}（${i.days_stagnant}日経過）`);
      }
    }
  }

  // 2. タスク期限超過
  const { data: overdueTasks } = await supabase
    .from('tasks')
    .select('title, due_date')
    .eq('project_id', projectId)
    .in('status', ['todo', 'in_progress'])
    .lt('due_date', todayStr)
    .limit(5);

  if (overdueTasks && overdueTasks.length > 0) {
    for (const t of overdueTasks) {
      const d = new Date(t.due_date);
      const diffDays = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      alerts.push(`⚠️ タスク期限超過: ${t.title}（${diffDays}日超過）`);
    }
  }

  // 3. MS期限接近（2日以内）
  const twoDaysStr = addDaysJST(2);

  const { data: urgentMs } = await supabase
    .from('milestones')
    .select('title, target_date')
    .eq('project_id', projectId)
    .in('status', ['pending', 'in_progress'])
    .lte('target_date', twoDaysStr)
    .gte('target_date', todayStr)
    .limit(3);

  if (urgentMs && urgentMs.length > 0) {
    for (const ms of urgentMs) {
      const d = new Date(ms.target_date);
      const diffDays = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      alerts.push(`🚩 MS期限接近: ${ms.title}（残${diffDays}日）`);
    }
  }

  if (alerts.length === 0) return null;

  return `🚨 アラート\n\n${alerts.join('\n')}`;
}

// ========================================
// 配信送信ユーティリティ
// ========================================

export async function sendToSlack(channelId: string, text: string): Promise<boolean> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return false;

  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ channel: channelId, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendToChatwork(roomId: string, text: string): Promise<boolean> {
  const token = process.env.CHATWORK_BOT_API_TOKEN || process.env.CHATWORK_API_TOKEN;
  if (!token) return false;

  try {
    const res = await fetch(`https://api.chatwork.com/v2/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: {
        'X-ChatWorkToken': token,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `body=${encodeURIComponent(text)}`,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deliverMessage(
  serviceName: 'slack' | 'chatwork',
  channelId: string,
  text: string
): Promise<boolean> {
  if (serviceName === 'slack') return sendToSlack(channelId, text);
  if (serviceName === 'chatwork') return sendToChatwork(channelId, text);
  return false;
}
