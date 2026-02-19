// GET /api/master — ナレッジマスタ全階層ツリー取得
import { NextResponse } from 'next/server';
import { KnowledgeMasterService } from '@/services/nodemap/knowledgeMaster.service';

export async function GET() {
  try {
    const hierarchy = await KnowledgeMasterService.getHierarchy();
    return NextResponse.json({ success: true, data: hierarchy });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'ナレッジマスタの取得に失敗しました' },
      { status: 500 }
    );
  }
}
