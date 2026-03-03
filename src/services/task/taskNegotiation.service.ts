// Phase 56c: タスク修正提案＋秘書AI調整サービス
import { getServerSupabase, getSupabase } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

export type ChangeType = 'deadline' | 'priority' | 'content' | 'reassign' | 'other';

export interface NegotiationRequest {
  id: string;
  taskId: string;
  requesterContactId: string | null;
  requesterName: string;
  changeType: ChangeType;
  currentValue: string | null;
  proposedValue: string;
  reason: string | null;
  aiResolution: AiResolution | null;
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt: string;
}

export interface AiResolution {
  applied: boolean;
  adjustedValue: string;
  reasoning: string;
}

export interface AdjustmentResult {
  adjustedTitle?: string;
  adjustedDeadline?: string;
  adjustedPriority?: string;
  adjustedDescription?: string;
  adjustedAssignee?: string;
  adjustedAssigneeName?: string;
  reasoning: string;
}

export interface NegotiationStatus {
  taskId: string;
  pendingCount: number;
  pendingRequests: NegotiationRequest[];
  hasAdjustment: boolean;
  adjustment?: AdjustmentResult;
}

const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  deadline: '納期変更',
  priority: '優先度変更',
  content: '内容変更',
  reassign: '担当者変更',
  other: 'その他',
};

export class TaskNegotiationService {
  // 修正リクエスト作成
  static async createRequest(
    taskId: string,
    userId: string,
    data: {
      requesterContactId?: string;
      requesterName: string;
      changeType: ChangeType;
      currentValue?: string;
      proposedValue: string;
      reason?: string;
    }
  ): Promise<NegotiationRequest | null> {
    const supabase = getServerSupabase() || getSupabase();
    const { data: row, error } = await supabase
      .from('task_negotiations')
      .insert({
        task_id: taskId,
        requester_contact_id: data.requesterContactId || null,
        requester_name: data.requesterName,
        change_type: data.changeType,
        current_value: data.currentValue || null,
        proposed_value: data.proposedValue,
        reason: data.reason || null,
        user_id: userId,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create negotiation request:', error);
      return null;
    }
    return mapFromDb(row);
  }

  // 未解決リクエスト一覧
  static async getPendingRequests(taskId: string): Promise<NegotiationRequest[]> {
    const supabase = getServerSupabase() || getSupabase();
    const { data, error } = await supabase
      .from('task_negotiations')
      .select('*')
      .eq('task_id', taskId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to get pending requests:', error);
      return [];
    }
    return (data || []).map(mapFromDb);
  }

  // 交渉状態サマリー
  static async getNegotiationStatus(taskId: string): Promise<NegotiationStatus> {
    const requests = await this.getPendingRequests(taskId);
    return {
      taskId,
      pendingCount: requests.length,
      pendingRequests: requests,
      hasAdjustment: false,
    };
  }

  // ユーザーの全タスクの未解決リクエスト数
  static async getPendingNegotiationCount(userId: string): Promise<number> {
    const supabase = getServerSupabase() || getSupabase();
    const { count, error } = await supabase
      .from('task_negotiations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'pending');

    if (error) return 0;
    return count || 0;
  }

  // AI調整案を生成
  static async generateAdjustment(taskId: string, userId: string): Promise<AdjustmentResult | null> {
    const supabase = getServerSupabase() || getSupabase();

    // タスク情報を取得
    const { data: task } = await supabase
      .from('tasks')
      .select('*, projects(name)')
      .eq('id', taskId)
      .single();

    if (!task) return null;

    // 未解決リクエスト取得
    const requests = await this.getPendingRequests(taskId);
    if (requests.length === 0) return null;

    // 担当者情報を取得
    let assigneeName = '未割り当て';
    if (task.assignee_contact_id) {
      const { data: contact } = await supabase
        .from('contact_persons')
        .select('name')
        .eq('id', task.assignee_contact_id)
        .single();
      if (contact) assigneeName = contact.name;
    }

    // リクエストのコンテキスト構築
    const requestLines = requests.map((r, i) => {
      const typeLabel = CHANGE_TYPE_LABELS[r.changeType];
      return `${i + 1}. ${r.requesterName}: ${typeLabel} → 希望: ${r.proposedValue}${r.reason ? ` (理由: ${r.reason})` : ''}${r.currentValue ? ` [現在: ${r.currentValue}]` : ''}`;
    }).join('\n');

    // AI調整案を生成
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // APIキーなし: 最初のリクエストの値をそのまま採用
      return {
        reasoning: 'AIキーが設定されていないため、最初の修正提案をそのまま採用します。',
        ...buildFallbackAdjustment(requests),
      };
    }

    try {
      const anthropic = new Anthropic({ apiKey });
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `あなたはチームのタスク調整を行う秘書AIです。

【現在のタスク】
- タイトル: ${task.title}
- 説明: ${task.description || 'なし'}
- 納期: ${task.due_date || '未設定'}
- 優先度: ${task.priority || 'medium'}
- 担当者: ${assigneeName}
- プロジェクト: ${(task as Record<string, unknown>).projects ? ((task as Record<string, unknown>).projects as Record<string, string>).name : '未設定'}

【メンバーからの修正希望】
${requestLines}

全員の希望を考慮し、実現可能な調整案を1つ提案してください。
各修正希望をどう反映したかの理由も明記してください。

JSON形式で回答:
{
  "adjustedTitle": "変更後タイトル（変更不要ならnull）",
  "adjustedDeadline": "YYYY-MM-DD形式（変更不要ならnull）",
  "adjustedPriority": "high/medium/low（変更不要ならnull）",
  "adjustedDescription": "変更後の説明（変更不要ならnull）",
  "adjustedAssignee": "担当者のcontact_id（変更不要ならnull）",
  "adjustedAssigneeName": "担当者名（変更不要ならnull）",
  "reasoning": "調整の理由と各希望への対応を説明"
}`,
        }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const result = JSON.parse(jsonMatch[0]) as AdjustmentResult;
      return result;
    } catch (error) {
      console.error('AI adjustment generation failed:', error);
      return {
        reasoning: 'AI生成に失敗したため、修正希望をそのまま提示します。',
        ...buildFallbackAdjustment(requests),
      };
    }
  }

  // 調整案をタスクに反映
  static async applyAdjustment(
    taskId: string,
    adjustment: AdjustmentResult
  ): Promise<boolean> {
    const supabase = getServerSupabase() || getSupabase();

    // タスク更新データ構築
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (adjustment.adjustedTitle) updateData.title = adjustment.adjustedTitle;
    if (adjustment.adjustedDeadline) updateData.due_date = adjustment.adjustedDeadline;
    if (adjustment.adjustedPriority) updateData.priority = adjustment.adjustedPriority;
    if (adjustment.adjustedDescription) updateData.description = adjustment.adjustedDescription;
    if (adjustment.adjustedAssignee) updateData.assignee_contact_id = adjustment.adjustedAssignee;

    // タスク更新
    const { error: updateError } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', taskId);

    if (updateError) {
      console.error('Failed to apply adjustment:', updateError);
      return false;
    }

    // リクエストをresolved状態に更新
    const { error: resolveError } = await supabase
      .from('task_negotiations')
      .update({
        status: 'resolved',
        ai_resolution: { applied: true, reasoning: adjustment.reasoning },
      })
      .eq('task_id', taskId)
      .eq('status', 'pending');

    if (resolveError) {
      console.error('Failed to resolve requests:', resolveError);
    }

    return true;
  }

  // リクエストを却下
  static async dismissRequests(taskId: string): Promise<boolean> {
    const supabase = getServerSupabase() || getSupabase();
    const { error } = await supabase
      .from('task_negotiations')
      .update({ status: 'dismissed' })
      .eq('task_id', taskId)
      .eq('status', 'pending');

    if (error) {
      console.error('Failed to dismiss requests:', error);
      return false;
    }
    return true;
  }
}

// DB行 → NegotiationRequest マッピング
function mapFromDb(row: Record<string, unknown>): NegotiationRequest {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    requesterContactId: row.requester_contact_id as string | null,
    requesterName: row.requester_name as string,
    changeType: row.change_type as ChangeType,
    currentValue: row.current_value as string | null,
    proposedValue: row.proposed_value as string,
    reason: row.reason as string | null,
    aiResolution: row.ai_resolution as AiResolution | null,
    status: row.status as 'pending' | 'resolved' | 'dismissed',
    createdAt: row.created_at as string,
  };
}

// AIキーなし時のフォールバック
function buildFallbackAdjustment(requests: NegotiationRequest[]): Partial<AdjustmentResult> {
  const result: Partial<AdjustmentResult> = {};
  for (const req of requests) {
    switch (req.changeType) {
      case 'deadline':
        result.adjustedDeadline = req.proposedValue;
        break;
      case 'priority':
        result.adjustedPriority = req.proposedValue;
        break;
      case 'content':
        result.adjustedDescription = req.proposedValue;
        break;
      case 'reassign':
        result.adjustedAssigneeName = req.proposedValue;
        break;
    }
  }
  return result;
}
