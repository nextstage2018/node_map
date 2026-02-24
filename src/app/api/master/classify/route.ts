// /api/master/classify — キーワード自動分類
import { NextRequest, NextResponse } from 'next/server';
import { KnowledgeMasterService } from '@/services/nodemap/knowledgeMaster.service';
import { getServerUserId } from '@/lib/serverAuth';

// POST: キーワードを自動分類
export async function POST(req: NextRequest) {
  try {
    // Phase 22: 認証確認
    await getServerUserId();
    const body = await req.json();
    const { label } = body;
    if (!label) {
      return NextResponse.json(
        { success: false, error: 'label は必須です' },
        { status: 400 }
      );
    }
    const result = await KnowledgeMasterService.classifyKeyword(label);
    return NextResponse.json({
      success: true,
      data: result, // null の場合は分類不能
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '分類に失敗しました' },
      { status: 500 }
    );
  }
}
