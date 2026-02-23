'use client';

/**
 * Phase 22.5: 認証プロバイダー
 * デモモード廃止 → 未認証ユーザーはログイン画面にリダイレクト
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// 認証不要なパス
const publicPaths = ['/login', '/signup', '/auth/callback'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const supabase = getSupabase();

  useEffect(() => {
    // 公開ページなら認証チェック不要
    if (publicPaths.some(p => pathname?.startsWith(p))) {
      setLoading(false);
      return;
    }

    // Supabase未設定 → ログインページへ
    if (!supabase || !isSupabaseConfigured()) {
      setLoading(false);
      router.replace('/login?error=not_configured');
      return;
    }

    // セッション取得
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // 未認証ならログインページへリダイレクト
      if (!session?.user) {
        router.replace(`/login?redirect=${encodeURIComponent(pathname || '/')}`);
      }
    });

    // 認証状態の変化を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        // ログアウトされたらログインページへ
        if (!session?.user && !publicPaths.some(p => pathname?.startsWith(p))) {
          router.replace('/login');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase, pathname, router]);

  const signOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
      router.replace('/login');
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
