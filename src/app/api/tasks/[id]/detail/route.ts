// v4.0: タスク詳細取得API（パネル用）
// task本体 + conversations + drive_documents + project/milestone/theme情報
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const { id } = await params;
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'DB接続エラー' }, { status: 500 });
    }

    // 1. タスク本体取得（JOIN: project, milestone, theme）
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select(`
        *,
        projects:project_id (id, name),
        milestones:milestone_id (id, title),
        themes:theme_id (id, title)
      `)
      .eq('id', id)
      .single();

    if (taskError || !task) {
      return NextResponse.json({ success: false, error: 'タスクが見つかりません' }, { status: 404 });
    }

    // 2. 会話履歴取得
    const { data: conversations } = await supabase
      .from('task_conversations')
      .select('id, role, content, phase, conversation_tag, turn_id, created_at')
      .eq('task_id', id)
      .order('created_at', { ascending: true });

    // 3. 関連資料取得
    const { data: documents } = await supabase
      .from('drive_documents')
      .select('id, title, document_url, document_type, created_at')
      .eq('task_id', id)
      .order('created_at', { ascending: false });

    // 4. 担当者情報
    let assigneeName: string | null = null;
    if (task.assigned_contact_id) {
      const { data: contact } = await supabase
        .from('contact_persons')
        .select('full_name, display_name')
        .eq('id', task.assigned_contact_id)
        .single();
      if (contact) {
        assigneeName = contact.display_name || contact.full_name;
      }
    }

    // レスポンス構築
    const project = task.projects as { id: string; name: string } | null;
    const milestone = task.milestones as { id: string; title: string } | null;
    const theme = task.themes as { id: string; title: string } | null;

    return NextResponse.json({
      success: true,
      data: {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        phase: task.phase,
        task_type: task.task_type,
        due_date: task.due_date,
        scheduled_start: task.scheduled_start,
        scheduled_end: task.scheduled_end,
        source_type: task.source_type,
        assigned_contact_id: task.assigned_contact_id,
        assignee_name: assigneeName,
        project_id: task.project_id,
        project_name: project?.name || null,
        milestone_id: task.milestone_id,
        milestone_title: milestone?.title || null,
        theme_id: task.theme_id,
        theme_title: theme?.title || null,
        result_summary: task.result_summary,
        ideation_summary: task.ideation_summary,
        created_at: task.created_at,
        updated_at: task.updated_at,
        // 関連データ
        conversations: conversations || [],
        documents: documents || [],
      },
    });
  } catch (error) {
    console.error('[TaskDetail] エラー:', error);
    return NextResponse.json({ success: false, error: 'タスク詳細の取得に失敗しました' }, { status: 500 });
  }
}
