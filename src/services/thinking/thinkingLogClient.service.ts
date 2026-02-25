// Phase 30: 思考ログサービス（デモモード対応）

import {
  ThinkingLog,
  ThinkingLogType,
  CreateThinkingLogRequest,
  UpdateThinkingLogRequest,
  ThinkingLogFilter,
} from '@/lib/types';
import { getSupabase } from '@/lib/supabase';

// === デモデータ ===

const now = new Date();
const h = (hours: number) => new Date(now.getTime() - hours * 3600000).toISOString();

const demoThinkingLogs: ThinkingLog[] = [
  {
    id: 'tlog-1',
    userId: 'demo-user-001',
    content: 'Reactのサーバーコンポーネントとクライアントコンポーネントの使い分けを整理する必要がある',
    logType: 'question',
    tags: ['React', 'アーキテクチャ'],
    createdAt: h(48),
    updatedAt: h(48),
  },
  {
    id: 'tlog-2',
    userId: 'demo-user-001',
    content: 'データ取得はサーバーコンポーネント、インタラクティブUIはクライアントコンポーネントという分離が明確になった',
    logType: 'insight',
    tags: ['React', 'アーキテクチャ'],
    createdAt: h(24),
    updatedAt: h(24),
  },
  {
    id: 'tlog-3',
    userId: 'demo-user-001',
    content: '次のスプリントでは認証フローの改善を優先する。理由: ユーザーからの離脱率が認証画面で最も高い',
    logType: 'hypothesis',
    tags: ['スプリント計画'],
    createdAt: h(6),
    updatedAt: h(6),
  },
  {
    id: 'tlog-4',
    userId: 'demo-user-001',
    content: 'ログイン画面のUX調査を行ったところ、フォームの入力ステップが多すぎることが判明',
    logType: 'observation',
    tags: ['UX', '認証'],
    createdAt: h(2),
    updatedAt: h(2),
  },
];

// === ヘルパー関数 ===

function mapThinkingLogFromDb(dbRow: Record<string, unknown>): ThinkingLog {
  return {
    id: dbRow.id as string,
    userId: dbRow.user_id as string,
    content: dbRow.content as string,
    logType: dbRow.log_type as ThinkingLogType,
    linkedNodeId: (dbRow.linked_node_id as string) || undefined,
    linkedTaskId: (dbRow.linked_task_id as string) || undefined,
    linkedSeedId: (dbRow.linked_seed_id as string) || undefined,
    tags: (dbRow.tags as string[]) || [],
    createdAt: dbRow.created_at as string,
    updatedAt: dbRow.updated_at as string,
  };
}

// === サービスクラス ===

export class ThinkingLogService {
  // 思考ログ一覧取得
  static async getLogs(userId: string, filter?: ThinkingLogFilter): Promise<ThinkingLog[]> {
    const sb = getSupabase();

    if (!sb) {
      // デモモード
      let logs = demoThinkingLogs.filter((l) => l.userId === userId);

      if (filter?.linkedNodeId) {
        logs = logs.filter((l) => l.linkedNodeId === filter.linkedNodeId);
      }
      if (filter?.linkedTaskId) {
        logs = logs.filter((l) => l.linkedTaskId === filter.linkedTaskId);
      }
      if (filter?.logType) {
        logs = logs.filter((l) => l.logType === filter.logType);
      }
      if (filter?.searchQuery) {
        const q = filter.searchQuery.toLowerCase();
        logs = logs.filter((l) => l.content.toLowerCase().includes(q));
      }

      logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const offset = filter?.offset || 0;
      const limit = filter?.limit || 50;
      return logs.slice(offset, offset + limit);
    }

    try {
      let query = sb
        .from('thinking_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (filter?.linkedNodeId) {
        query = query.eq('linked_node_id', filter.linkedNodeId);
      }
      if (filter?.linkedTaskId) {
        query = query.eq('linked_task_id', filter.linkedTaskId);
      }
      if (filter?.logType) {
        query = query.eq('log_type', filter.logType);
      }
      if (filter?.searchQuery) {
        query = query.ilike('content', `%${filter.searchQuery}%`);
      }

      const limit = filter?.limit || 50;
      const offset = filter?.offset || 0;
      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map(mapThinkingLogFromDb);
    } catch (error) {
      console.error('思考ログの取得エラー:', error);
      return [];
    }
  }

  // 思考ログ作成
  static async createLog(userId: string, request: CreateThinkingLogRequest): Promise<ThinkingLog> {
    const sb = getSupabase();
    const nowStr = new Date().toISOString();

    const newLog: ThinkingLog = {
      id: `tlog-${Date.now()}`,
      userId,
      content: request.content,
      logType: request.logType,
      linkedNodeId: request.linkedNodeId,
      linkedTaskId: request.linkedTaskId,
      linkedSeedId: request.linkedSeedId,
      tags: request.tags || [],
      createdAt: nowStr,
      updatedAt: nowStr,
    };

    if (!sb) {
      // デモモード
      demoThinkingLogs.unshift(newLog);
      return newLog;
    }

    try {
      const { data, error } = await sb
        .from('thinking_logs')
        .insert({
          user_id: userId,
          content: request.content,
          log_type: request.logType,
          linked_node_id: request.linkedNodeId || null,
          linked_task_id: request.linkedTaskId || null,
          linked_seed_id: request.linkedSeedId || null,
          tags: request.tags || [],
        })
        .select()
        .single();

      if (error) {
        console.error('思考ログの作成エラー (Supabase):', error);
        return newLog;
      }

      return mapThinkingLogFromDb(data);
    } catch (error) {
      console.error('思考ログの作成エラー:', error);
      return newLog;
    }
  }

  // 思考ログ更新
  static async updateLog(logId: string, userId: string, updates: UpdateThinkingLogRequest): Promise<ThinkingLog | null> {
    const sb = getSupabase();

    if (!sb) {
      // デモモード
      const idx = demoThinkingLogs.findIndex((l) => l.id === logId && l.userId === userId);
      if (idx === -1) return null;

      const updated: ThinkingLog = {
        ...demoThinkingLogs[idx],
        ...(updates.content !== undefined ? { content: updates.content } : {}),
        ...(updates.logType !== undefined ? { logType: updates.logType } : {}),
        ...(updates.tags !== undefined ? { tags: updates.tags } : {}),
        updatedAt: new Date().toISOString(),
      };
      demoThinkingLogs[idx] = updated;
      return updated;
    }

    try {
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (updates.content !== undefined) updateData.content = updates.content;
      if (updates.logType !== undefined) updateData.log_type = updates.logType;
      if (updates.tags !== undefined) updateData.tags = updates.tags;

      const { data, error } = await sb
        .from('thinking_logs')
        .update(updateData)
        .eq('id', logId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        console.error('思考ログの更新エラー:', error);
        return null;
      }

      return mapThinkingLogFromDb(data);
    } catch (error) {
      console.error('思考ログの更新エラー:', error);
      return null;
    }
  }

  // 思考ログ削除
  static async deleteLog(logId: string, userId: string): Promise<boolean> {
    const sb = getSupabase();

    if (!sb) {
      // デモモード
      const idx = demoThinkingLogs.findIndex((l) => l.id === logId && l.userId === userId);
      if (idx === -1) return false;
      demoThinkingLogs.splice(idx, 1);
      return true;
    }

    try {
      const { error } = await sb
        .from('thinking_logs')
        .delete()
        .eq('id', logId)
        .eq('user_id', userId);

      if (error) {
        console.error('思考ログの削除エラー:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('思考ログの削除エラー:', error);
      return false;
    }
  }
}
