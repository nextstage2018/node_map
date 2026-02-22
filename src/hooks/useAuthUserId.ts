'use client';

import { useAuth } from '@/components/auth/AuthProvider';

const DEMO_USER_ID = 'demo-user-001';

/**
 * 認証済みユーザーのIDを返すフック
 * Supabase未設定時（デモモード）は固定のデモユーザーIDを返す
 */
export function useAuthUserId(): string {
  const { user, isDemo } = useAuth();
  
  if (isDemo) {
    return DEMO_USER_ID;
  }
  
  return user?.id ?? DEMO_USER_ID;
}
