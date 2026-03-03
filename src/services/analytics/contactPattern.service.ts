// Phase 51c: コンタクト応答パターン検出サービス
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export interface OverdueReply {
  contactName: string;
  contactId: string;
  daysWithoutReply: number;
  lastMessage: string;
  lastMessageDate: string;
  suggestedAction: 'reply' | 'followup' | 'schedule';
}

export interface StagnantTask {
  taskId: string;
  title: string;
  daysSinceUpdate: number;
  status: string;
  priority: string;
}

export interface ProjectMomentum {
  projectId: string;
  projectName: string;
  eventCount7d: number;
  trend: 'active' | 'moderate' | 'stagnant';
  daysSinceLastEvent: number;
}

export interface PatternInsights {
  overdueReplies: OverdueReply[];
  stagnantTasks: StagnantTask[];
  projectMomentum: ProjectMomentum[];
  computedAt: string;
}

export class ContactPatternService {
  /**
   * 未返信コンタクトを検出
   * inbox_messagesのペア分析（received → 対応するsent があるか）
   */
  static async detectOverdueReplies(userId: string): Promise<OverdueReply[]> {
    const sb = getServerSupabase() || getSupabase();
    if (!sb) return [];

    try {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

      // 2日以上前の未読受信メッセージを取得
      const { data: unreplied } = await sb
        .from('inbox_messages')
        .select('id, from_name, from_address, subject, body, created_at')
        .eq('direction', 'received')
        .eq('is_read', false)
        .lt('created_at', twoDaysAgo)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!unreplied || unreplied.length === 0) return [];

      const results: OverdueReply[] = [];
      const seenAddresses = new Set<string>();

      for (const msg of unreplied) {
        const addr = msg.from_address;
        if (!addr || seenAddresses.has(addr)) continue;
        seenAddresses.add(addr);

        // このアドレスへの送信があるかチェック
        const { count } = await sb
          .from('inbox_messages')
          .select('*', { count: 'exact', head: true })
          .eq('direction', 'sent')
          .or(`to_address.eq.${addr},from_address.eq.${addr}`)
          .gt('created_at', msg.created_at);

        if (count && count > 0) continue; // 返信済み

        const daysSince = Math.floor((Date.now() - new Date(msg.created_at).getTime()) / 86400000);

        // コンタクト情報取得
        let contactName = msg.from_name || addr;
        let contactId = '';
        try {
          const { data: ch } = await sb
            .from('contact_channels')
            .select('contact_id, contact_persons!inner(name)')
            .eq('address', addr)
            .limit(1);
          if (ch && ch.length > 0) {
            contactId = ch[0].contact_id;
            contactName = (ch[0] as any).contact_persons?.name || contactName;
          }
        } catch { /* ignore */ }

        results.push({
          contactName,
          contactId,
          daysWithoutReply: daysSince,
          lastMessage: (msg.subject || msg.body || '').slice(0, 100),
          lastMessageDate: msg.created_at,
          suggestedAction: daysSince >= 5 ? 'followup' : 'reply',
        });
      }

      return results.sort((a, b) => b.daysWithoutReply - a.daysWithoutReply).slice(0, 10);
    } catch (error) {
      console.error('[ContactPattern] detectOverdueReplies エラー:', error);
      return [];
    }
  }

  /**
   * 停滞タスクを検出（3日以上更新なし）
   */
  static async detectStagnantTasks(userId: string): Promise<StagnantTask[]> {
    const sb = getServerSupabase() || getSupabase();
    if (!sb) return [];

    try {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

      const { data: stagnant } = await sb
        .from('tasks')
        .select('id, title, status, priority, updated_at')
        .eq('user_id', userId)
        .neq('status', 'done')
        .lt('updated_at', threeDaysAgo)
        .order('updated_at', { ascending: true })
        .limit(10);

      if (!stagnant) return [];

      return stagnant.map(t => ({
        taskId: t.id,
        title: t.title,
        daysSinceUpdate: Math.floor((Date.now() - new Date(t.updated_at).getTime()) / 86400000),
        status: t.status,
        priority: t.priority,
      }));
    } catch (error) {
      console.error('[ContactPattern] detectStagnantTasks エラー:', error);
      return [];
    }
  }

  /**
   * プロジェクト勢いを計算
   */
  static async computeProjectMomentum(userId: string): Promise<ProjectMomentum[]> {
    const sb = getServerSupabase() || getSupabase();
    if (!sb) return [];

    try {
      // ユーザーのプロジェクト一覧
      const { data: projects } = await sb
        .from('projects')
        .select('id, name')
        .eq('user_id', userId)
        .limit(20);

      if (!projects || projects.length === 0) return [];

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const results: ProjectMomentum[] = [];

      for (const proj of projects) {
        // 7日間のイベント数
        const { count: eventCount } = await sb
          .from('business_events')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', proj.id)
          .gte('created_at', sevenDaysAgo);

        // 最新イベント日
        const { data: latest } = await sb
          .from('business_events')
          .select('created_at')
          .eq('project_id', proj.id)
          .order('created_at', { ascending: false })
          .limit(1);

        const daysSinceLast = latest && latest.length > 0
          ? Math.floor((Date.now() - new Date(latest[0].created_at).getTime()) / 86400000)
          : 999;

        const count7d = eventCount || 0;
        const trend: ProjectMomentum['trend'] = count7d >= 5 ? 'active'
          : count7d >= 2 ? 'moderate'
          : 'stagnant';

        results.push({
          projectId: proj.id,
          projectName: proj.name,
          eventCount7d: count7d,
          trend,
          daysSinceLastEvent: daysSinceLast,
        });
      }

      return results.sort((a, b) => b.eventCount7d - a.eventCount7d);
    } catch (error) {
      console.error('[ContactPattern] computeProjectMomentum エラー:', error);
      return [];
    }
  }

  /**
   * 全パターンインサイトを計算
   */
  static async computeAllInsights(userId: string): Promise<PatternInsights> {
    const [overdueReplies, stagnantTasks, projectMomentum] = await Promise.all([
      this.detectOverdueReplies(userId),
      this.detectStagnantTasks(userId),
      this.computeProjectMomentum(userId),
    ]);

    return {
      overdueReplies,
      stagnantTasks,
      projectMomentum,
      computedAt: new Date().toISOString(),
    };
  }
}
