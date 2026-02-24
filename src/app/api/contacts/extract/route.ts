// POST /api/contacts/extract — メッセージからコンタクトを自動抽出
import { NextResponse } from 'next/server';
import { ContactPersonService } from '@/services/contact/contactPerson.service';
import { getServerUserId } from '@/lib/serverAuth';

export async function POST() {
  try {
    // Phase 22: 認証確認
    await getServerUserId();
    const result = await ContactPersonService.extractFromMessages();
    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '抽出に失敗しました' },
      { status: 500 }
    );
  }
}
