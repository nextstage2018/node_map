// MeetGeek録画ダウンロードリンク取得API（オンデマンド）
// 会議録のsource_type='meetgeek' かつ source_file_id を使って
// MeetGeek APIからダウンロードリンクを発行する
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const MEETGEEK_API_BASE = 'https://api.meetgeek.ai/v1';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const meetgeekApiKey = process.env.MEETGEEK_API_KEY;
    if (!meetgeekApiKey) {
      return NextResponse.json({ success: false, error: 'MeetGeek APIキー未設定' }, { status: 500 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    const { id } = await params;

    // 会議録を取得
    const { data: record, error } = await supabase
      .from('meeting_records')
      .select('id, source_type, source_file_id, title')
      .eq('id', id)
      .single();

    if (error || !record) {
      return NextResponse.json({ success: false, error: '会議録が見つかりません' }, { status: 404 });
    }

    // MeetGeek以外の会議録は対象外
    if (record.source_type !== 'meetgeek' || !record.source_file_id) {
      return NextResponse.json({
        success: false,
        error: 'この会議録にはMeetGeek録画がありません',
      }, { status: 400 });
    }

    // MeetGeek APIからダウンロードリンクを取得
    const downloadRes = await fetch(
      `${MEETGEEK_API_BASE}/meetings/${record.source_file_id}/download`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${meetgeekApiKey}` },
      }
    );

    if (!downloadRes.ok) {
      const errText = await downloadRes.text().catch(() => '');
      console.error(`[MeetGeek Recording] ダウンロードリンク取得失敗: ${downloadRes.status} ${errText}`);
      return NextResponse.json({
        success: false,
        error: '録画リンクの取得に失敗しました。録画が存在しないか、まだ処理中の可能性があります。',
      }, { status: 502 });
    }

    const downloadData = await downloadRes.json();

    return NextResponse.json({
      success: true,
      data: {
        meeting_record_id: record.id,
        title: record.title,
        download_link: downloadData.download_link,
        expires_in: downloadData.expires_in, // 秒（通常 14400 = 4時間）
      },
    });
  } catch (err) {
    console.error('[MeetGeek Recording] エラー:', err);
    return NextResponse.json({ success: false, error: 'サーバーエラー' }, { status: 500 });
  }
}
