// v4.0 Phase 2: AI提案承認→タスク一括作成API
// POST /api/task-suggestions/[id]/approve

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

interface ApproveItem {
  title: string;
  assigned_contact_id?: string;
  due_date?: string;
  priority?: string;
  milestone_id?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: suggestionId } = await params;
    const body = await request.json();
    const { items } = body as { items: ApproveItem[] };

    if (!items || items.length === 0) {
      return NextResponse.json({ error: '承認するアイテムがありません' }, { status: 400 });
    }

    const { getServerSupabase, getSupabase } = await import('@/lib/supabase');
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'DB接続エラー' }, { status: 500 });
    }

    // suggestion を取得
    const { data: suggestion, error: sugError } = await supabase
      .from('task_suggestions')
      .select('*')
      .eq('id', suggestionId)
      .eq('user_id', userId)
      .single();

    if (sugError || !suggestion) {
      return NextResponse.json({ error: '提案が見つかりません' }, { status: 404 });
    }

    if (suggestion.status !== 'pending') {
      return NextResponse.json({ error: 'この提案は既に処理済みです' }, { status: 400 });
    }

    const suggestionsData = suggestion.suggestions as Record<string, unknown>;
    const projectId = suggestionsData?.projectId as string | undefined;

    // v4.0: 依頼者・担当候補をcontact_personsから自動解決
    let requesterContactId: string | null = null;
    let autoAssigneeContactId: string | null = null;

    const requesterAddress = suggestionsData?.requester_address as string | undefined;
    const assigneeAddresses = (suggestionsData?.assignee_addresses || []) as string[];

    // address → contact_id の解決関数
    async function resolveContactByAddress(address: string): Promise<string | null> {
      if (!address) return null;
      // まず contact_channels.address で検索
      const { data: channelMatch } = await supabase
        .from('contact_channels')
        .select('contact_id')
        .eq('address', address)
        .limit(1);
      if (channelMatch && channelMatch.length > 0) return channelMatch[0].contact_id;

      // フォールバック: contact_persons.id が直接アドレスと一致するケース
      const { data: directMatch } = await supabase
        .from('contact_persons')
        .select('id')
        .eq('id', address)
        .limit(1);
      if (directMatch && directMatch.length > 0) return directMatch[0].id;

      return null;
    }

    // 依頼者の解決
    if (requesterAddress) {
      requesterContactId = await resolveContactByAddress(requesterAddress);
    }

    // 担当候補の解決（TO先の最初の1人）
    if (assigneeAddresses.length > 0) {
      for (const addr of assigneeAddresses) {
        const contactId = await resolveContactByAddress(addr);
        if (contactId) {
          autoAssigneeContactId = contactId;
          break;
        }
      }
    }

    // タスクを一括作成
    const createdTasks = [];
    for (const item of items) {
      // UIから指定されたassigned_contact_idがあればそれを優先、なければ自動解決
      const finalAssignee = item.assigned_contact_id || autoAssigneeContactId || null;

      const taskData: Record<string, unknown> = {
        user_id: userId,
        title: item.title,
        status: 'todo',
        priority: item.priority || 'medium',
        phase: 'ideation',
        task_type: finalAssignee ? 'group' : 'personal',
        source_type: suggestion.meeting_record_id ? 'meeting_record' : (suggestionsData?.channel || 'manual'),
        due_date: item.due_date || null,
        project_id: projectId || null,
        milestone_id: item.milestone_id || null,
        assigned_contact_id: finalAssignee,
        requester_contact_id: requesterContactId,
      };

      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .insert(taskData)
        .select('id, title, status')
        .single();

      if (taskError) {
        console.error('[Approve API] タスク作成エラー:', taskError);
        continue;
      }

      if (task) {
        createdTasks.push(task);

        // グループタスクの場合、task_membersにオーナーを追加
        if (finalAssignee) {
          await supabase.from('task_members').upsert(
            { task_id: task.id, user_id: userId, role: 'owner' },
            { onConflict: 'task_id,user_id' }
          );
        }
      }
    }

    // suggestion を accepted に更新
    await supabase
      .from('task_suggestions')
      .update({ status: 'accepted' })
      .eq('id', suggestionId);

    return NextResponse.json({
      success: true,
      data: {
        tasks_created: createdTasks.length,
        tasks: createdTasks,
      },
    });
  } catch (error) {
    console.error('[Approve API] エラー:', error);
    return NextResponse.json({ error: '内部エラー' }, { status: 500 });
  }
}
