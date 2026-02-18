// ノード統計API
// GET: ユーザーのノード統計情報

import { NextRequest, NextResponse } from 'next/server';
import { NodeService } from '@/services/nodemap/nodeClient.service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'demo-user';

    const stats = await NodeService.getStats(userId);
    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error('統計取得エラー:', error);
    return NextResponse.json(
      { success: false, error: '統計情報の取得に失敗しました' },
      { status: 500 }
    );
  }
}
