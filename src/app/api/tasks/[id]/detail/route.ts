// v4.0: タスク詳細取得API（パネル用）
// task本体 + conversations + drive_documents + project/milestone/theme + source情報
// JOINは使わず別クエリで取得（tasks→milestones/themes のFK不整合回避）
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

    // 1. タスク本体取得（JOINなしでシンプルに）
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single();

    if (taskError) {
      console.error('[TaskDetail] タスク取得エラー:', taskError);
      return NextResponse.json({ success: false, error: 'タスクが見つかりません', detail: taskError.message }, { status: 404 });
    }
    if (!task) {
      return NextResponse.json({ success: false, error: 'タスクが見つかりません' }, { status: 404 });
    }

    // 2. プロジェクト情報
    let projectName: string | null = null;
    let projectChannels: Array<{ service_name: string; identifier: string; channel_name?: string }> = [];
    if (task.project_id) {
      const { data: project } = await supabase
        .from('projects')
        .select('id, name')
        .eq('id', task.project_id)
        .single();
      if (project) projectName = project.name;

      // プロジェクトチャネル情報（作成元特定用）
      const { data: channels } = await supabase
        .from('project_channels')
        .select('service_name, channel_identifier, channel_label')
        .eq('project_id', task.project_id);
      if (channels) projectChannels = channels.map(c => ({
        service_name: c.service_name,
        identifier: c.channel_identifier,
        channel_name: c.channel_label,
      }));
    }

    // 3. マイルストーン・テーマ情報
    let milestoneTitle: string | null = null;
    let themeTitle: string | null = null;
    if (task.milestone_id) {
      const { data: ms } = await supabase
        .from('milestones')
        .select('id, title, theme_id')
        .eq('id', task.milestone_id)
        .single();
      if (ms) {
        milestoneTitle = ms.title;
        if (ms.theme_id) {
          const { data: theme } = await supabase
            .from('themes')
            .select('id, title')
            .eq('id', ms.theme_id)
            .single();
          if (theme) themeTitle = theme.title;
        }
      }
    }

    // 4. 担当者情報
    let assigneeName: string | null = null;
    if (task.assigned_contact_id) {
      const { data: contact } = await supabase
        .from('contact_persons')
        .select('full_name, display_name, name')
        .eq('id', task.assigned_contact_id)
        .single();
      if (contact) assigneeName = contact.display_name || contact.full_name || contact.name;
    }

    // 4b. 依頼者情報（v4.0）
    let requesterName: string | null = null;
    if (task.requester_contact_id) {
      const { data: requester } = await supabase
        .from('contact_persons')
        .select('full_name, display_name, name')
        .eq('id', task.requester_contact_id)
        .single();
      if (requester) requesterName = requester.display_name || requester.full_name || requester.name;
    }

    // 5. 会話履歴取得
    const { data: conversations } = await supabase
      .from('task_conversations')
      .select('id, role, content, phase, conversation_tag, turn_id, created_at')
      .eq('task_id', id)
      .order('created_at', { ascending: true });

    // 6. 関連資料取得
    const { data: documents } = await supabase
      .from('drive_documents')
      .select('id, title, document_url, document_type, created_at')
      .eq('task_id', id)
      .order('created_at', { ascending: false });

    // 7. 元のソース情報（生成元を特定）
    let sourceInfo: { type: string; label: string; detail?: string } | null = null;
    if (task.source_type === 'meeting_record' && task.source_message_id) {
      const { data: mr } = await supabase
        .from('meeting_records')
        .select('id, title, meeting_date')
        .eq('id', task.source_message_id)
        .single();
      sourceInfo = {
        type: 'meeting_record',
        label: '議事録から生成',
        detail: mr ? `${mr.title}（${mr.meeting_date}）` : undefined,
      };
    } else if (task.source_type === 'slack' || task.source_type === 'chatwork') {
      const channelLabel = task.source_type === 'slack' ? 'Slack' : 'Chatwork';
      // source_channel_id でマッチするチャネルを優先、なければservice_nameで
      const channel = projectChannels.find(c =>
        c.service_name === task.source_type && c.identifier === task.source_channel_id
      ) || projectChannels.find(c => c.service_name === task.source_type);
      const channelName = channel?.channel_name;
      sourceInfo = {
        type: task.source_type,
        label: channelName
          ? `${channelLabel} ${channelName} から生成`
          : `${channelLabel}から生成`,
      };
    } else {
      sourceInfo = {
        type: 'manual',
        label: '手動作成',
      };
    }

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
        source_info: sourceInfo,
        assigned_contact_id: task.assigned_contact_id,
        assignee_name: assigneeName,
        requester_contact_id: task.requester_contact_id,
        requester_name: requesterName,
        user_id: task.user_id,
        project_id: task.project_id,
        project_name: projectName,
        milestone_id: task.milestone_id,
        milestone_title: milestoneTitle,
        theme_id: task.theme_id,
        theme_title: themeTitle,
        result_summary: task.result_summary,
        ideation_summary: task.ideation_summary,
        created_at: task.created_at,
        updated_at: task.updated_at,
        conversations: conversations || [],
        documents: documents || [],
      },
    });
  } catch (error) {
    console.error('[TaskDetail] エラー:', error);
    return NextResponse.json({ success: false, error: 'タスク詳細の取得に失敗しました' }, { status: 500 });
  }
}
