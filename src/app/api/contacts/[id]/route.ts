// PUT /api/contacts/:id — 関係属性更新
// DELETE /api/contacts/:id — コンタクト削除（V2-B）
import { NextRequest, NextResponse } from 'next/server';
import { ContactPersonService } from '@/services/contact/contactPerson.service';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Phase 22: 認証確認
    await getServerUserId();
    const { id } = await params;
    const body = await req.json();
    const { relationshipType } = body;
    if (!relationshipType) {
      return NextResponse.json(
        { success: false, error: 'relationshipType は必須です' },
        { status: 400 }
      );
    }
    const contact = await ContactPersonService.updateRelationship(
      id,
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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const supabase = getServerSupabase() || getSupabase();

    // contact_channels は ON DELETE CASCADE で自動削除される
    const { error } = await supabase
      .from('contact_persons')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '削除に失敗しました' },
      { status: 500 }
    );
  }
}
