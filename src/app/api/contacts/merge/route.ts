// Phase 35: コンタクトマージ API
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// POST: mergeIds のデータを primaryId に統合し、mergeIds を削除
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Supabase未設定' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { primaryId, mergeIds } = body;

    if (!primaryId || !mergeIds || !Array.isArray(mergeIds) || mergeIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'primaryIdとmergeIds（配列）は必須です' },
        { status: 400 }
      );
    }

    // Phase 35: primaryIdが実在するか確認
    const { data: primary, error: primaryError } = await supabase
      .from('contact_persons')
      .select('id')
      .eq('id', primaryId)
      .single();

    if (primaryError || !primary) {
      return NextResponse.json(
        { success: false, error: '統合先のコンタクトが見つかりません' },
        { status: 404 }
      );
    }

    // Phase 35: contact_channels を primaryId に付け替え
    // UNIQUE (contact_id, channel, address) 制約があるため、重複を先に処理する
    const { data: primaryChannels } = await supabase
      .from('contact_channels')
      .select('channel, address')
      .eq('contact_id', primaryId);

    const { data: mergeChannels } = await supabase
      .from('contact_channels')
      .select('id, channel, address')
      .in('contact_id', mergeIds);

    if (mergeChannels && mergeChannels.length > 0) {
      const primarySet = new Set(
        (primaryChannels || []).map((c) => `${c.channel}::${c.address}`)
      );
      const duplicateIds: string[] = [];
      const moveIds: string[] = [];

      for (const mc of mergeChannels) {
        const key = `${mc.channel}::${mc.address}`;
        if (primarySet.has(key)) {
          duplicateIds.push(mc.id);
        } else {
          moveIds.push(mc.id);
          primarySet.add(key); // 同じmergeIds同士の重複も防ぐ
        }
      }

      // 重複するチャネルは削除
      if (duplicateIds.length > 0) {
        const { error: delDupErr } = await supabase
          .from('contact_channels')
          .delete()
          .in('id', duplicateIds);
        if (delDupErr) {
          console.error('[Contacts Merge API] 重複チャネル削除エラー:', delDupErr);
        }
      }

      // 残りをprimaryIdに付け替え
      if (moveIds.length > 0) {
        const { error: moveErr } = await supabase
          .from('contact_channels')
          .update({ contact_id: primaryId })
          .in('id', moveIds);
        if (moveErr) {
          console.error('[Contacts Merge API] チャネル移行エラー:', moveErr);
        }
      }
    }

    // Phase 35: business_events の contact_id を primaryId に更新
    const { error: eventsError } = await supabase
      .from('business_events')
      .update({ contact_id: primaryId })
      .in('contact_id', mergeIds);

    if (eventsError) {
      console.error('[Contacts Merge API] イベント更新エラー:', eventsError);
    }

    // Phase 35: project_members の contact_id を primaryId に更新
    const { error: membersError } = await supabase
      .from('project_members')
      .update({ contact_id: primaryId })
      .in('contact_id', mergeIds);

    if (membersError) {
      console.error('[Contacts Merge API] メンバー更新エラー:', membersError);
    }

    // Phase 35: user_nodes の contact_id を primaryId に更新
    const { error: nodesError } = await supabase
      .from('user_nodes')
      .update({ contact_id: primaryId })
      .in('contact_id', mergeIds);

    if (nodesError) {
      console.error('[Contacts Merge API] ノード更新エラー:', nodesError);
    }

    // Phase 35: mergeIds のコンタクトを削除
    const { error: deleteError } = await supabase
      .from('contact_persons')
      .delete()
      .in('id', mergeIds);

    if (deleteError) {
      console.error('[Contacts Merge API] 削除エラー:', deleteError);
      return NextResponse.json(
        { success: false, error: '統合元の削除に失敗しました: ' + deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { primaryId, mergedCount: mergeIds.length },
    });
  } catch (error) {
    console.error('[Contacts Merge API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'コンタクトの統合に失敗しました' },
      { status: 500 }
    );
  }
}
