// Multi-Assignee API: タスクの担当者一覧取得・追加・削除
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// GET: タスクの担当者一覧を取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: taskId } = await params;
    const { getServerSupabase, getSupabase } = await import('@/lib/supabase');
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) return NextResponse.json({ error: 'DB接続エラー' }, { status: 500 });

    const { data, error } = await supabase
      .from('task_assignees')
      .select('id, contact_id, assigned_at')
      .eq('task_id', taskId)
      .order('assigned_at', { ascending: true });

    if (error) {
      console.error('[Assignees GET] Error:', error);
      return NextResponse.json({ error: '取得失敗' }, { status: 500 });
    }

    // 担当者名を解決
    const contactIds = (data || []).map(d => d.contact_id);
    let contactMap: Record<string, string> = {};
    if (contactIds.length > 0) {
      const { data: contacts } = await supabase
        .from('contact_persons')
        .select('id, name')
        .in('id', contactIds);
      if (contacts) {
        contactMap = Object.fromEntries(contacts.map(c => [c.id, c.name]));
      }
    }

    const assignees = (data || []).map(d => ({
      id: d.id,
      contact_id: d.contact_id,
      name: contactMap[d.contact_id] || '不明',
      assigned_at: d.assigned_at,
    }));

    return NextResponse.json({ success: true, data: assignees });
  } catch (error) {
    console.error('[Assignees GET] Error:', error);
    return NextResponse.json({ error: '内部エラー' }, { status: 500 });
  }
}

// POST: 担当者を追加
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: taskId } = await params;
    const body = await request.json();
    const { contact_id } = body;

    if (!contact_id) {
      return NextResponse.json({ error: 'contact_id is required' }, { status: 400 });
    }

    const { getServerSupabase, getSupabase } = await import('@/lib/supabase');
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) return NextResponse.json({ error: 'DB接続エラー' }, { status: 500 });

    // task_assignees に追加
    const { data, error } = await supabase
      .from('task_assignees')
      .insert({ task_id: taskId, contact_id })
      .select('id, contact_id, assigned_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'この担当者は既に追加されています' }, { status: 409 });
      }
      console.error('[Assignees POST] Error:', error);
      return NextResponse.json({ error: '追加失敗' }, { status: 500 });
    }

    // メイン担当者（assigned_contact_id）が未設定の場合は自動設定
    const { data: task } = await supabase
      .from('tasks')
      .select('assigned_contact_id')
      .eq('id', taskId)
      .single();

    if (task && !task.assigned_contact_id) {
      await supabase
        .from('tasks')
        .update({ assigned_contact_id: contact_id })
        .eq('id', taskId);
    }

    // 名前を解決
    const { data: contact } = await supabase
      .from('contact_persons')
      .select('name')
      .eq('id', contact_id)
      .single();

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        contact_id: data.contact_id,
        name: contact?.name || '不明',
        assigned_at: data.assigned_at,
      },
    });
  } catch (error) {
    console.error('[Assignees POST] Error:', error);
    return NextResponse.json({ error: '内部エラー' }, { status: 500 });
  }
}

// DELETE: 担当者を削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: taskId } = await params;
    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get('contact_id');

    if (!contactId) {
      return NextResponse.json({ error: 'contact_id is required' }, { status: 400 });
    }

    const { getServerSupabase, getSupabase } = await import('@/lib/supabase');
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) return NextResponse.json({ error: 'DB接続エラー' }, { status: 500 });

    const { error } = await supabase
      .from('task_assignees')
      .delete()
      .eq('task_id', taskId)
      .eq('contact_id', contactId);

    if (error) {
      console.error('[Assignees DELETE] Error:', error);
      return NextResponse.json({ error: '削除失敗' }, { status: 500 });
    }

    // メイン担当者が削除された場合、次の担当者を自動昇格
    const { data: task } = await supabase
      .from('tasks')
      .select('assigned_contact_id')
      .eq('id', taskId)
      .single();

    if (task?.assigned_contact_id === contactId) {
      const { data: remaining } = await supabase
        .from('task_assignees')
        .select('contact_id')
        .eq('task_id', taskId)
        .order('assigned_at', { ascending: true })
        .limit(1);

      await supabase
        .from('tasks')
        .update({ assigned_contact_id: remaining?.[0]?.contact_id || null })
        .eq('id', taskId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Assignees DELETE] Error:', error);
    return NextResponse.json({ error: '内部エラー' }, { status: 500 });
  }
}
