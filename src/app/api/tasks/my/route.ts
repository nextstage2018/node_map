// v4.0 Phase 2: 個人タスク横断取得API
// フィルター: today / this_week / overdue / all
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all';

    // 今日の日付（JST）
    const now = new Date();
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstNow = new Date(now.getTime() + jstOffset);
    const todayStr = jstNow.toISOString().split('T')[0];

    // 今週の最終日（日曜日）を計算
    const dayOfWeek = jstNow.getDay();
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    const endOfWeek = new Date(jstNow.getTime() + daysUntilSunday * 24 * 60 * 60 * 1000);
    const endOfWeekStr = endOfWeek.toISOString().split('T')[0];

    // ベースクエリ: 自分のタスクを取得（プロジェクト・マイルストーン・ゴール情報付き）
    let query = supabase
      .from('tasks')
      .select(`
        id, title, status, priority, phase, due_date,
        scheduled_start, scheduled_end, description,
        project_id, milestone_id, created_at, updated_at,
        projects:project_id (
          id, name, organization_id,
          organizations:organization_id ( name )
        ),
        milestones:milestone_id (
          id, title, goal_id,
          goals:goal_id ( id, title )
        )
      `)
      .eq('user_id', userId)
      .neq('status', 'done');

    // フィルター適用
    switch (filter) {
      case 'today':
        // due_date が今日 OR scheduled_start ≤ today ≤ scheduled_end
        query = query.or(`due_date.eq.${todayStr},and(scheduled_start.lte.${todayStr},scheduled_end.gte.${todayStr})`);
        break;

      case 'this_week':
        // due_date が今週内
        query = query
          .gte('due_date', todayStr)
          .lte('due_date', endOfWeekStr);
        break;

      case 'overdue':
        // due_date < today AND status ≠ done（doneは既に除外済み）
        query = query
          .lt('due_date', todayStr)
          .not('due_date', 'is', null);
        break;

      case 'all':
      default:
        // 全タスク（done以外）
        break;
    }

    // ソート: 期限が近い順 → 作成日順
    query = query
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(200);

    const { data, error } = await query;

    if (error) {
      console.error('[Tasks My API] 取得エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // カウント情報を追加（各フィルターの件数）
    const allTasks = data || [];

    // 期限切れ件数（全タスクベースでカウント）
    let overdueCount = 0;
    let todayCount = 0;
    let thisWeekCount = 0;

    if (filter === 'all') {
      // allの時は件数を計算して返す
      for (const t of allTasks) {
        if (t.due_date) {
          if (t.due_date < todayStr) overdueCount++;
          else if (t.due_date === todayStr) todayCount++;
          else if (t.due_date <= endOfWeekStr) thisWeekCount++;
        }
        // scheduled_start/end による today判定
        if (!t.due_date && t.scheduled_start && t.scheduled_end) {
          if (t.scheduled_start <= todayStr && t.scheduled_end >= todayStr) todayCount++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: allTasks,
      counts: {
        total: allTasks.length,
        overdue: overdueCount,
        today: todayCount,
        thisWeek: thisWeekCount,
      },
      filter,
    });
  } catch (error) {
    console.error('[Tasks My API] エラー:', error);
    return NextResponse.json({ success: false, error: '個人タスクの取得に失敗しました' }, { status: 500 });
  }
}
