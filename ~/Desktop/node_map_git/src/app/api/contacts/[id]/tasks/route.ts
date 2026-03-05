// Phase 51: コンタクト関連タスク取得API
import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: true, data: [] });
    }

    const { id: contactId } = await params;

    // 1. コンタクトの組織IDを取得
    const { data: contact } = await supabase
      .from('contact_persons')
      .select('organization_id')
      .eq('id', contactId)
      .maybeSingle();

    if (!contact || !contact.organization_id) {
      return NextResponse.json({ success: true, data: [] });
    }

    // 2. 組織のプロジェクト一覧を取得
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name')
      .eq('organization_id', contact.organization_id);

    if (!projects || projects.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const projectIds = projects.map(p => p.id);
    const projectMap = new Map(projects.map(p => [p.id, p.name]));

    // 3. プロジェクトに紐づくタスクを取得
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('id, title, status, priority, due_date, project_id')
      .in('project_id', projectIds)
      .order('created_at', { ascending: false })
      .limit(20);

    if (tasksError) {
      console.error('[Contact Tasks API] Error:', tasksError);
      return NextResponse.json({ success: false, error: tasksError.message }, { status: 500 });
    }

    const formattedTasks = (tasks || []).map(t => ({
      id: t.id,
      title: t.title || '',
      status: t.status || 'todo',
      priority: t.priority || 'medium',
      due_date: t.due_date || null,
      project_name: projectMap.get(t.project_id) || '',
    }));

    return NextResponse.json({ success: true, data: formattedTasks });
  } catch (error) {
    console.error('[Contact Tasks API] Error:', error);
    return NextResponse.json({ success: false, error: 'タスクの取得に失敗しました' }, { status: 500 });
  }
}
