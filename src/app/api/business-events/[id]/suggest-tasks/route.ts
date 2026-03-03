// Phase 56: 会議メモからAI親子タスク提案API
import { NextResponse } from 'next/server';
import { getServerSupabase, createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';
import { suggestTasksWithStructure, matchContactByName } from '@/services/businessLog/taskSuggestion.service';

export const dynamic = 'force-dynamic';

// GET: 会議イベントの内容から親タスク＋子タスクをAI提案
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const { id } = await params;

    const supabase = getServerSupabase() || createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    // イベント取得
    const { data: event, error } = await supabase
      .from('business_events')
      .select('*, projects(name)')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !event) {
      return NextResponse.json(
        { success: false, error: 'イベントが見つかりません' },
        { status: 404 }
      );
    }

    if (!event.content) {
      return NextResponse.json({
        success: true,
        data: { parentTask: null, childTasks: [] },
      });
    }

    const projectName = (event.projects as { name?: string } | null)?.name || null;

    // 参加者名を抽出（contentから【参加者】セクション）
    const participantMatch = event.content.match(/【参加者】([^\n]+)/);
    const participantNames = participantMatch
      ? participantMatch[1].split(/[,、]/).map((n: string) => n.trim()).filter(Boolean)
      : [];

    const result = await suggestTasksWithStructure(event.content, projectName, participantNames);

    if (!result) {
      return NextResponse.json({
        success: true,
        data: { parentTask: null, childTasks: [] },
      });
    }

    // 担当者名からcontact_personsマッチング
    for (const child of result.childTasks) {
      if (child.assigneeName) {
        const contactId = await matchContactByName(supabase, userId, child.assigneeName);
        if (contactId) {
          child.assigneeContactId = contactId;
        }
      }
    }

    // task_suggestionsに保存
    try {
      await supabase
        .from('task_suggestions')
        .insert({
          user_id: userId,
          business_event_id: id,
          suggestions: result,
          status: 'pending',
        });
    } catch (saveErr) {
      console.error('[SuggestTasks API] 提案保存エラー（続行）:', saveErr);
    }

    return NextResponse.json({
      success: true,
      data: {
        parentTask: result.parentTask,
        childTasks: result.childTasks,
        projectId: event.project_id || null,
      },
    });
  } catch (error) {
    console.error('[SuggestTasks API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'タスク提案の生成に失敗しました' },
      { status: 500 }
    );
  }
}
