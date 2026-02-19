// GET /api/contacts — コンタクト一覧（フィルター対応）
import { NextRequest, NextResponse } from 'next/server';
import { ContactPersonService } from '@/services/contact/contactPerson.service';
import type { PersonRelationshipType, ChannelType } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const relationshipType = searchParams.get('relationship') as PersonRelationshipType | null;
    const channel = searchParams.get('channel') as ChannelType | null;
    const searchQuery = searchParams.get('search') || undefined;

    const contacts = await ContactPersonService.getContacts({
      relationshipType: relationshipType || undefined,
      channel: channel || undefined,
      searchQuery,
    });
    return NextResponse.json({ success: true, data: contacts });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'コンタクトの取得に失敗しました' },
      { status: 500 }
    );
  }
}
