import { NextRequest, NextResponse } from 'next/server';
import { getBlocklist, addToBlocklist, removeFromBlocklist } from '@/services/inbox/inboxStorage.service';

export const dynamic = 'force-dynamic';

/**
 * ブロックリスト管理API
 * GET    /api/inbox/blocklist           - 一覧取得
 * POST   /api/inbox/blocklist           - 追加
 * DELETE /api/inbox/blocklist?id=xxx    - 削除
 */
export async function GET() {
  try {
    const blocklist = await getBlocklist();
    return NextResponse.json({ success: true, data: blocklist });
  } catch (error) {
    console.error('[Blocklist] 取得エラー:', error);
    return NextResponse.json({ success: false, error: '取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, matchType, reason } = body;

    if (!address) {
      return NextResponse.json({ success: false, error: 'アドレスが必要です' }, { status: 400 });
    }

    const result = await addToBlocklist(address, matchType || 'exact', reason);
    if (result) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ success: false, error: '追加に失敗しました' }, { status: 500 });
    }
  } catch (error) {
    console.error('[Blocklist] 追加エラー:', error);
    return NextResponse.json({ success: false, error: '追加に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'IDが必要です' }, { status: 400 });
    }

    const result = await removeFromBlocklist(id);
    if (result) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ success: false, error: '削除に失敗しました' }, { status: 500 });
    }
  } catch (error) {
    console.error('[Blocklist] 削除エラー:', error);
    return NextResponse.json({ success: false, error: '削除に失敗しました' }, { status: 500 });
  }
}
