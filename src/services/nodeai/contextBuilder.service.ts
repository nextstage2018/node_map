// NodeAI: コンテキスト構築サービス
// MCPサーバーのロジックを流用し、プロジェクト情報をClaude用に構築する

import { getServerSupabase, getSupabase } from '@/lib/supabase';

// ========================================
// 型定義
// ========================================

type RelationshipType = 'internal' | 'client' | 'partner';

interface ProjectContext {
  projectName: string;
  organizationName: string;
  relationshipType: RelationshipType;
  tasks: string;
  decisions: string;
  openIssues: string;
  milestones: string;
  bossFeedback: string;
  pronunciationGuide: string; // 読み方ガイド（TTS用）
}

// ========================================
// キャッシュ（セッション中はプロジェクト情報がほぼ変わらない）
// ========================================

interface CachedContext {
  context: ProjectContext;
  cachedAt: number; // epoch seconds
}

// プロジェクトIDをキーにしたインメモリキャッシュ（TTL: 5分）
const contextCache = new Map<string, CachedContext>();
const CACHE_TTL_SECONDS = 300; // 5分

/**
 * キャッシュ付きプロジェクトコンテキスト取得
 * セッション中に同じプロジェクト情報を何度もDBから取得するのを防ぐ
 */
export async function getCachedProjectContext(
  projectId: string
): Promise<ProjectContext | null> {
  const now = Date.now() / 1000;
  const cached = contextCache.get(projectId);
  if (cached && (now - cached.cachedAt) < CACHE_TTL_SECONDS) {
    return cached.context;
  }

  const context = await buildProjectContext(projectId);
  if (context) {
    contextCache.set(projectId, { context, cachedAt: now });
  } else {
    console.error('[NodeAI:context] buildProjectContext returned null for:', projectId);
  }
  return context;
}

// ========================================
// メイン関数
// ========================================

function getDb() {
  const sb = getServerSupabase();
  if (!sb) {
    console.warn('[NodeAI:context] getServerSupabase() returned null, falling back to getSupabase()');
  }
  return sb || getSupabase();
}

/**
 * プロジェクトIDからNodeAI用のコンテキストを構築
 */
export async function buildProjectContext(
  projectId: string
): Promise<ProjectContext | null> {
  const supabase = getDb();
  if (!supabase) return null;

  try {
    // プロジェクト + 組織情報を並列取得
    const [projectResult, tasksResult, decisionsResult, issuesResult, msResult, feedbackResult, membersResult] =
      await Promise.all([
        // プロジェクト情報
        supabase
          .from('projects')
          .select('name, organization_id, organizations(name, relationship_type)')
          .eq('id', projectId)
          .single(),
        // タスク（進行中 + 着手前）
        supabase
          .from('tasks')
          .select('id, title, status, due_date, assigned_contact_id, contact_persons:assigned_contact_id(name)')
          .eq('project_id', projectId)
          .in('status', ['todo', 'in_progress', 'review'])
          .order('due_date', { ascending: true })
          .limit(20),
        // 決定事項（直近10件）
        supabase
          .from('decision_log')
          .select('title, content, decided_at, status')
          .eq('project_id', projectId)
          .in('status', ['active', 'on_hold'])
          .order('decided_at', { ascending: false })
          .limit(10),
        // 未確定事項
        supabase
          .from('open_issues')
          .select('title, description, status, days_stagnant, priority_score')
          .eq('project_id', projectId)
          .in('status', ['open', 'stale'])
          .order('priority_score', { ascending: false })
          .limit(15),
        // マイルストーン（進行中）
        supabase
          .from('milestones')
          .select('title, target_date, status, success_criteria')
          .eq('project_id', projectId)
          .in('status', ['pending', 'in_progress'])
          .order('target_date', { ascending: true })
          .limit(5),
        // 上長フィードバック
        supabase
          .from('boss_feedback_learnings')
          .select('feedback_type, original_text, learning_point')
          .eq('project_id', projectId)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(5),
        // プロジェクトメンバーの読み仮名（TTS用）
        supabase
          .from('project_members')
          .select('contact_id, contact_persons:contact_id(name, name_reading)')
          .eq('project_id', projectId),
      ]);

    const project = projectResult.data;
    if (!project) {
      console.error('[NodeAI:context] Project not found:', projectId, 'error:', projectResult.error?.message);
      return null;
    }

    const org = project.organizations as { name: string; relationship_type: string } | null;
    const relType = (org?.relationship_type || 'internal') as RelationshipType;

    // タスク情報をテキスト化
    const tasks = (tasksResult.data || [])
      .map((t) => {
        const assignee = (t.contact_persons as { name: string } | null)?.name || '未割当';
        const dueStr = t.due_date ? `期限:${t.due_date}` : '期限なし';
        const statusMap: Record<string, string> = {
          todo: '着手前', in_progress: '進行中', review: 'レビュー中',
        };
        return `- ${t.title}（${statusMap[t.status] || t.status}）担当:${assignee} ${dueStr}`;
      })
      .join('\n') || 'なし';

    // 決定事項をテキスト化
    const decisions = (decisionsResult.data || [])
      .map((d) => `- ${d.title}（${d.decided_at || '日付不明'}）${d.status === 'on_hold' ? '[保留中]' : ''}`)
      .join('\n') || 'なし';

    // 未確定事項をテキスト化
    const openIssues = (issuesResult.data || [])
      .map((i) => {
        const stale = i.status === 'stale' ? '[長期未解決]' : '';
        return `- ${i.title}${stale}（${i.days_stagnant || 0}日経過）`;
      })
      .join('\n') || 'なし';

    // マイルストーンをテキスト化
    const milestones = (msResult.data || [])
      .map((m) => `- ${m.title}（目標:${m.target_date || '未設定'}）${m.success_criteria ? `達成基準:${m.success_criteria}` : ''}`)
      .join('\n') || 'なし';

    // 上長フィードバックをテキスト化（internalのみ）
    const bossFeedback = relType === 'internal'
      ? (feedbackResult.data || [])
          .map((f) => `- [${f.feedback_type}] ${f.learning_point}`)
          .join('\n') || 'なし'
      : '';

    // 読み方ガイド構築（メンバーのname_readingから）
    const allGuides: Array<{ text: string; reading: string }> = [];

    // ② メンバーのname_reading（個人プロフィールで登録された読み仮名）
    if (membersResult.data) {
      for (const m of membersResult.data) {
        const cp = m.contact_persons as { name: string; name_reading: string | null } | null;
        if (cp?.name && cp?.name_reading) {
          allGuides.push({ text: cp.name, reading: cp.name_reading });
        }
      }
    }

    const pronunciationGuide = allGuides
      .map((g) => `${g.text} → ${g.reading}`)
      .join('\n');

    return {
      projectName: project.name,
      organizationName: org?.name || '',
      relationshipType: relType,
      tasks,
      decisions,
      openIssues,
      milestones,
      bossFeedback,
      pronunciationGuide,
    };
  } catch (err) {
    console.error('[NodeAI] Failed to build context:', err);
    return null;
  }
}

/**
 * 参加者メールからプロジェクトを自動特定
 * Recall.aiの参加者メール → contact_channels → project_members → project
 */
export async function resolveProjectFromParticipants(
  participantEmails: string[]
): Promise<string | null> {
  const supabase = getDb();
  if (!supabase || participantEmails.length === 0) return null;

  try {
    // メール → contact_persons
    const { data: channels } = await supabase
      .from('contact_channels')
      .select('contact_id')
      .eq('channel', 'email')
      .in('address', participantEmails);

    if (!channels || channels.length === 0) return null;

    const contactIds = channels.map((c) => c.contact_id);

    // contact_persons → project_members → projects
    const { data: members } = await supabase
      .from('project_members')
      .select('project_id')
      .in('contact_id', contactIds);

    if (!members || members.length === 0) return null;

    // 最もメンバー一致率が高いプロジェクトを選択
    const projectCounts: Record<string, number> = {};
    for (const m of members) {
      projectCounts[m.project_id] = (projectCounts[m.project_id] || 0) + 1;
    }

    const sorted = Object.entries(projectCounts).sort(([, a], [, b]) => b - a);
    return sorted[0]?.[0] || null;
  } catch (err) {
    console.error('[NodeAI] Failed to resolve project:', err);
    return null;
  }
}

/**
 * 参加者メールからcontact_personsを解決
 */
export async function resolveContactFromEmail(
  email: string
): Promise<{ contactId: string; name: string } | null> {
  const supabase = getDb();
  if (!supabase) return null;

  try {
    const { data: channel } = await supabase
      .from('contact_channels')
      .select('contact_id, contact_persons:contact_id(id, name)')
      .eq('channel', 'email')
      .eq('address', email)
      .limit(1)
      .single();

    if (!channel) return null;

    const contact = channel.contact_persons as { id: string; name: string } | null;
    if (!contact) return null;

    return { contactId: contact.id, name: contact.name };
  } catch {
    return null;
  }
}

/**
 * 組織のrelationship_typeを取得
 */
export async function getRelationshipType(
  projectId: string
): Promise<RelationshipType> {
  const supabase = getDb();
  if (!supabase) return 'internal';

  try {
    const { data } = await supabase
      .from('projects')
      .select('organizations(relationship_type)')
      .eq('id', projectId)
      .single();

    const org = data?.organizations as { relationship_type: string } | null;
    return (org?.relationship_type || 'internal') as RelationshipType;
  } catch {
    return 'internal';
  }
}
