// /api/master/entries — マスタキーワード一覧
import { NextRequest, NextResponse } from 'next/server';
import { KnowledgeMasterService } from '@/services/nodemap/knowledgeMaster.service';

// GET: マスタキーワード一覧（?fieldId= でフィルター可能）
export async function GET(req: NextRequest) {
  try {
    const fieldId = req.nextUrl.searchParams.get('fieldId') || undefined;
    const entries = await KnowledgeMasterService.getMasterEntries(fieldId);
    return NextResponse.json({ success: true, data: entries });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'マスタキーワードの取得に失敗しました' },
      { status: 500 }
    );
  }
}
