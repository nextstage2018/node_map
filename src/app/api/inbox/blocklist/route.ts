import { NextRequest, NextResponse } from 'next/server';
import { getBlocklist, addToBlocklist, removeFromBlocklist } from '@/services/inbox/inboxStorage.service';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Phase 22: 認証確認（RLSでデータ分離）
    await getServerUserId();
    const blocklist = await getBlocklist();
    return NextResponse.json({ success: true, data: blocklist });
  } catch (error) {
    console.error('ブロックリスト取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ブロックリストの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Phase 22: 認証確認
    await getServerUserId();
    const body = await request.json();
    const { address, matchType, reason } = body;

    if (!address) {
      return NextResponse.json(
        { success: false, error: 'address は必須です' },
        { status: 400 }
      );
    }

    const entry = await addToBlocklist(address, matchType, reason);
    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error('ブロックリスト追加エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ブロックリストへの追加に失敗しました' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Phase 22: 認証確認
    await getServerUserId();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'id は必須です' },
        { status: 400 }
      );
    }

    await removeFromBlocklist(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('ブロックリスト削除エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ブロックリストからの削除に失敗しました' },
      { status: 500 }
    );
  }
}
