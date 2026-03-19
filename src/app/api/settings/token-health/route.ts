// v10.4: トークンヘルスチェックAPI
// GET — ログインユーザーの全サービストークン有効性を検証

import { NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { checkUserTokenHealth } from '@/services/tokenHealth/tokenHealth.service';

export async function GET() {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const health = await checkUserTokenHealth(userId);

    return NextResponse.json({
      success: true,
      data: health,
    });
  } catch (error) {
    console.error('[TokenHealth API] エラー:', error);
    return NextResponse.json(
      { error: 'ヘルスチェック失敗' },
      { status: 500 }
    );
  }
}
