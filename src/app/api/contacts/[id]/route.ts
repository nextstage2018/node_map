// PUT /api/contacts/:id — 関係属性更新
import { NextRequest, NextResponse } from 'next/server';
import { ContactPersonService } from '@/services/contact/contactPerson.service';
import { getServerUserId } from '@/lib/serverAuth';

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Phase 22: 認証確認
    await getServerUserId();
    const body = await req.json();
    const { relationshipType } = body;
    if (!relationshipType) {
      return NextResponse.json(
        { success: false, error: 'relationshipType は必須です' },
        { status: 400 }
      );
    }
    const contact = await ContactPersonService.updateRelationship(
      params.id,
      relationshipType
    );
    if (!contact) {
      return NextResponse.json(
        { success: false, error: 'コンタクトが見つかりません' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: contact });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '更新に失敗しました' },
      { status: 500 }
    );
  }
}
