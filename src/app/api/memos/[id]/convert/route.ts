// メモ→タスク直接変換API
// メモの内容 + AI会話履歴からAIがタイトル・説明・優先度を自動生成してタスクを作成

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';
import { TaskService } from '@/services/task/taskClient.service';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: memoId } = await params;
    const body = await request.json();
    const { projectId, taskType, dueDate } = body;

    const sb = getServerSupabase() || getSupabase();

    // 1. メモ本体を取得
    const { data: memo, error: memoError } = await sb
      .from('idea_memos')
      .select('*')
      .eq('id', memoId)
      .eq('user_id', userId)
      .single();

    if (memoError || !memo) {
      return NextResponse.json({ error: 'メモが見つかりません' }, { status: 404 });
    }

    // 2. メモのAI会話履歴を取得
    const { data: conversations } = await sb
      .from('memo_conversations')
      .select('role, content, created_at')
      .eq('memo_id', memoId)
      .order('created_at', { ascending: true });

    // 3. AI でタスク情報を自動生成
    let taskTitle = memo.content.slice(0, 50);
    let taskDescription = memo.content;
    let taskPriority: 'high' | 'medium' | 'low' = 'medium';

    const conversationText = conversations && conversations.length > 0
      ? conversations
          .map((c: { role: string; content: string }) =>
            `${c.role === 'user' ? 'ユーザー' : 'AI'}: ${c.content.slice(0, 300)}`
          )
          .join('\n')
      : '';

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey });
        const response = await client.messages.create({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 600,
          system: `あなたはアイデアメモをタスクに変換する専門家です。
メモの内容とAI会話の履歴を踏まえて、タスク情報をJSON形式で生成してください。

出力フォーマット（JSONのみ、他のテキストは不要）:
{
  "title": "簡潔なタスクタイトル（30文字以内）",
  "description": "タスクの説明。メモの要点とAI会話で得た洞察を含む（200文字以内）",
  "priority": "high" | "medium" | "low"
}

ルール:
- titleは動詞で始める具体的なアクション（例: 「○○を調査する」「△△の提案書を作成する」）
- descriptionにはメモの核心とAI会話で深掘りした内容を自然にまとめる
- priorityはメモの内容から判断（緊急性・重要性が高ければhigh）
- 日本語で出力`,
          messages: [{
            role: 'user',
            content: `メモ:\n${memo.content}${conversationText ? `\n\nAI会話:\n${conversationText}` : ''}`,
          }],
        });

        const text = response.content[0]?.type === 'text' ? response.content[0].text : null;
        if (text) {
          // JSONパース（コードブロック除去対応）
          const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
          const parsed = JSON.parse(cleaned);
          if (parsed.title) taskTitle = parsed.title;
          if (parsed.description) taskDescription = parsed.description;
          if (['high', 'medium', 'low'].includes(parsed.priority)) {
            taskPriority = parsed.priority;
          }
        }
      } catch (e) {
        console.error('[Memo→Task] AI生成エラー（フォールバック）:', e);
        // フォールバック: メモ内容をそのまま使用
        taskTitle = memo.content.slice(0, 50).replace(/\n/g, ' ');
        taskDescription = memo.content;
        if (conversationText) {
          taskDescription += '\n\n--- AI会話からの洞察 ---\n' + conversationText.slice(0, 500);
        }
      }
    } else {
      // APIキーなし: フォールバック
      taskTitle = memo.content.slice(0, 50).replace(/\n/g, ' ');
      taskDescription = memo.content;
      if (conversationText) {
        taskDescription += '\n\n--- AI会話からの洞察 ---\n' + conversationText.slice(0, 500);
      }
    }

    // 4. タスクを作成
    const task = await TaskService.createTask({
      title: taskTitle,
      description: taskDescription,
      priority: taskPriority,
      taskType: taskType || 'personal',
      projectId: projectId || undefined,
      userId,
    });

    // 5. 期限日を設定
    if (dueDate && task.id) {
      await sb
        .from('tasks')
        .update({ due_date: dueDate })
        .eq('id', task.id);
    }

    // 6. メモに変換先タスクIDを記録（バックリンク）
    await sb
      .from('idea_memos')
      .update({ converted_task_id: task.id })
      .eq('id', memoId);

    return NextResponse.json({
      success: true,
      data: {
        task: {
          id: task.id,
          title: taskTitle,
          description: taskDescription,
          priority: taskPriority,
        },
        memoId,
      },
    });
  } catch (error) {
    console.error('[Memo→Task] エラー:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
