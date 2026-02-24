// Phase 25: メッセージ既読API
import { NextResponse, NextRequest } from 'next/server';
import { markAsRead } from '@/services/inbox/inboxStorage.service';
import { isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * POST /api/messages/read
 * body: { messageIds: string[] }
 *
 * 指定されたメッセージIDをDBで既読にする
 */
export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      // デモモードではDB更新なし（ローカル状態のみ）
      return NextResponse.json({ success: true, updated: 0 });
    }

    const body = await request.json();
    const messageIds: string[] = body.messageIds;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'messageIds が必要です' },
        { status: 400 }
      );
    }

    // 各メッセージを既読に更新
    let updated = 0;
    for (const id of messageIds) {
      try {
        await markAsRead(id);
        updated++;
      } catch (err) {
        console.error(`[Messages/Read] 既読更新エラー (${id}):`, err);
      }
    }

    console.log(`[Messages/Read] ${updated}/${messageIds.length}件を既読に更新`);

    return NextResponse.json({ success: true, updated });
  } catch (error) {
    console.error('[Messages/Read] エラー:', error);
    return NextResponse.json(
      { success: false, error: '既読処理に失敗しました' },
      { status: 500 }
    );
  }
}
