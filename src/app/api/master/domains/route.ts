// /api/master/domains — 領域CRUD
import { NextRequest, NextResponse } from 'next/server';
import { KnowledgeMasterService } from '@/services/nodemap/knowledgeMaster.service';
import { getServerUserId } from '@/lib/serverAuth';

// GET: 領域一覧
export async function GET() {
  try {
    // Phase 22: 認証確認
    await getServerUserId();
    const domains = await KnowledgeMasterService.getDomains();
    return NextResponse.json({ success: true, data: domains });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '領域の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// POST: 領域追加
export async function POST(req: NextRequest) {
  try {
    // Phase 22: 認証確認
    await getServerUserId();
    const body = await req.json();
    const { name, description, color } = body;
    if (!name || !description || !color) {
      return NextResponse.json(
        { success: false, error: 'name, description, color は必須です' },
        { status: 400 }
      );
    }
    const domain = await KnowledgeMasterService.addDomain(name, description, color);
    return NextResponse.json({ success: true, data: domain });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '領域の追加に失敗しました' },
      { status: 500 }
    );
  }
}

// PUT: 領域更新
export async function PUT(req: NextRequest) {
  try {
    await getServerUserId();
    const body = await req.json();
    const { id, name, description, color } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: 'id は必須です' }, { status: 400 });
    }
    const result = await KnowledgeMasterService.updateDomain(id, { name, description, color });
    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '領域の更新に失敗しました' },
      { status: 500 }
    );
  }
}

// DELETE: 領域削除
export async function DELETE(req: NextRequest) {
  try {
    await getServerUserId();
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'id は必須です' }, { status: 400 });
    }
    await KnowledgeMasterService.deleteDomain(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '領域の削除に失敗しました' },
      { status: 500 }
    );
  }
}
