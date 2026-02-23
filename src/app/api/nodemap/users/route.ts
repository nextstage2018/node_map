import { NextResponse } from 'next/server';
import type { MapUser } from '@/lib/types';
import { getServerUserId } from '@/lib/serverAuth';

// デモ用ユーザーリスト
const demoUsers: MapUser[] = [
  { id: 'user_self', displayName: '自分', avatarColor: '#3B82F6' },
  { id: 'user_tanaka', displayName: '田中部長', avatarColor: '#EF4444' },
  { id: 'user_sato', displayName: '佐藤さん', avatarColor: '#10B981' },
  { id: 'user_yamada', displayName: '山田さん', avatarColor: '#F59E0B' },
];

export async function GET() {
  // Phase 22: 認証確認（将来的にユーザーDB連携予定）
  await getServerUserId();
  return NextResponse.json({ success: true, data: demoUsers });
}
