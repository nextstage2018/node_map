// /api/master/domains — 領域CRUD
import { NextRequest, NextResponse } from 'next/server';
import { KnowledgeMasterService } from '@/services/nodemap/knowledgeMaster.service';

// GET: 領域一覧
export async function GET() {
  try {
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
