// /api/master/fields — 分野CRUD
import { NextRequest, NextResponse } from 'next/server';
import { KnowledgeMasterService } from '@/services/nodemap/knowledgeMaster.service';
import { getServerUserId } from '@/lib/serverAuth';

// GET: 分野一覧（?domainId= でフィルター可能）
export async function GET(req: NextRequest) {
  try {
    // Phase 22: 認証確認
    await getServerUserId();
    const domainId = req.nextUrl.searchParams.get('domainId') || undefined;
    const fields = await KnowledgeMasterService.getFields(domainId);
    return NextResponse.json({ success: true, data: fields });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '分野の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// POST: 分野追加
export async function POST(req: NextRequest) {
  try {
    // Phase 22: 認証確認
    await getServerUserId();
    const body = await req.json();
    const { domainId, name, description } = body;
    if (!domainId || !name || !description) {
      return NextResponse.json(
        { success: false, error: 'domainId, name, description は必須です' },
        { status: 400 }
      );
    }
    const field = await KnowledgeMasterService.addField(domainId, name, description);
    return NextResponse.json({ success: true, data: field });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '分野の追加に失敗しました' },
      { status: 500 }
    );
  }
}

// PUT: 分野更新
export async function PUT(req: NextRequest) {
  try {
    await getServerUserId();
    const body = await req.json();
    const { id, name, description, domainId } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: 'id は必須です' }, { status: 400 });
    }
    const result = await KnowledgeMasterService.updateField(id, { name, description, domainId });
    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '分野の更新に失敗しました' },
      { status: 500 }
    );
  }
}

// DELETE: 分野削除
export async function DELETE(req: NextRequest) {
  try {
    await getServerUserId();
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'id は必須です' }, { status: 400 });
    }
    await KnowledgeMasterService.deleteField(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '分野の削除に失敗しました' },
      { status: 500 }
    );
  }
}
