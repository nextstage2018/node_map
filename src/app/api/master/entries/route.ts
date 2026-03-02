// /api/master/entries — マスタキーワード一覧
import { NextRequest, NextResponse } from 'next/server';
import { KnowledgeMasterService } from '@/services/nodemap/knowledgeMaster.service';
import { getServerUserId } from '@/lib/serverAuth';

// GET: マスタキーワード一覧（?fieldId= でフィルター可能）
export async function GET(req: NextRequest) {
  try {
    // Phase 22: 認証確認
    await getServerUserId();
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

// POST: キーワード追加
export async function POST(req: NextRequest) {
  try {
    await getServerUserId();
    const body = await req.json();
    const { fieldId, label, synonyms, description } = body;
    if (!label) {
      return NextResponse.json({ success: false, error: 'label は必須です' }, { status: 400 });
    }
    const entry = await KnowledgeMasterService.addEntry(fieldId || null, label, synonyms || [], description || null);
    return NextResponse.json({ success: true, data: entry });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'キーワードの追加に失敗しました' },
      { status: 500 }
    );
  }
}

// PUT: キーワード更新（同義語含む）
export async function PUT(req: NextRequest) {
  try {
    await getServerUserId();
    const body = await req.json();
    const { id, label, synonyms, description, fieldId } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: 'id は必須です' }, { status: 400 });
    }
    const result = await KnowledgeMasterService.updateEntry(id, { label, synonyms, description, fieldId });
    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'キーワードの更新に失敗しました' },
      { status: 500 }
    );
  }
}

// DELETE: キーワード削除
export async function DELETE(req: NextRequest) {
  try {
    await getServerUserId();
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'id は必須です' }, { status: 400 });
    }
    await KnowledgeMasterService.deleteEntry(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'キーワードの削除に失敗しました' },
      { status: 500 }
    );
  }
}
