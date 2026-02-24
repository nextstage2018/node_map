// GET /api/contacts/stats — コンタクト統計
import { NextResponse } from 'next/server';
import { ContactPersonService } from '@/services/contact/contactPerson.service';
import { getServerUserId } from '@/lib/serverAuth';

export async function GET() {
  try {
    // Phase 22: 認証確認
    await getServerUserId();
    const stats = await ContactPersonService.getStats();
    return NextResponse.json({ success: true, data: stats });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '統計の取得に失敗しました' },
      { status: 500 }
    );
  }
}
