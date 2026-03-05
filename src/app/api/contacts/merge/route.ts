// Phase 35: コンタクトマージAPI
import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    const body = await request.json();
    const { primaryId, mergeIds } = body;

    if (!primaryId || !Array.isArray(mergeIds) || mergeIds.length === 0) {
      return NextResponse.json({ success: false, error: 'primaryId と mergeIds は必須です' }, { status: 400 });
    }

    if (mergeIds.includes(primaryId)) {
      return NextResponse.json({ success: false, error: 'primaryId は mergeIds に含めないでください' }, { status: 400 });
    }

    // 1. マージ元のチャンネルを取得
    const { data: mergeChannels } = await supabase
      .from('contact_channels')
      .select('id, contact_id, channel, address')
      .in('contact_id', mergeIds);

    // 2. プライマリの既存チャンネルを取得（重複防止）
    const { data: primaryChannels } = await supabase
      .from('contact_channels')
      .select('channel, address')
      .eq('contact_id', primaryId);

    const primaryChannelSet = new Set(
      (primaryChannels || []).map(ch => `${ch.channel}:${ch.address?.toLowerCase()}`)
    );

    // 3. 重複しないチャンネルをプライマリに移動
    if (mergeChannels && mergeChannels.length > 0) {
      for (const ch of mergeChannels) {
        const key = `${ch.channel}:${ch.address?.toLowerCase()}`;
        if (primaryChannelSet.has(key)) {
          // 重複 → 削除
          await supabase.from('contact_channels').delete().eq('id', ch.id);
        } else {
          // 移動
          await supabase.from('contact_channels').update({ contact_id: primaryId }).eq('id', ch.id);
          primaryChannelSet.add(key);
        }
      }
    }

    // 4. マージ元のコンタクトに紐づくtask_membersやconsultationsがあれば移動
    // thought_task_nodesなど関連テーブルも考慮（存在しない場合はスキップ）
    try {
      await supabase.from('consultations').update({ responder_contact_id: primaryId }).in('responder_contact_id', mergeIds);
    } catch { /* テーブルが存在しない場合は無視 */ }

    // 5. マージ元のコンタクトを削除
    const { error: deleteError } = await supabase
      .from('contact_persons')
      .delete()
      .in('id', mergeIds);

    if (deleteError) {
      console.error('[Merge API] Delete error:', deleteError);
      return NextResponse.json({ success: false, error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: { mergedCount: mergeIds.length },
    });
  } catch (error) {
    console.error('[Merge API] Error:', error);
    return NextResponse.json({ success: false, error: 'マージに失敗しました' }, { status: 500 });
  }
}
