import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Supabaseが設定済みかどうかを判定
export function isSupabaseConfigured(): boolean {
  return !!(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http'));
}

// クライアント（Supabase未設定時はnull）
let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!_supabase) {
    _supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _supabase;
}

// 後方互換: 既存コードが supabase を直接参照している場合
export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey)
  : (null as unknown as SupabaseClient);

// サーバーサイド用（Service Role Key使用）
export function createServerClient(): SupabaseClient | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!isSupabaseConfigured() || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

// サーバーサイド用（キャッシュ付き）— RLSバイパスが必要なサービス層で使用
let _serverClient: SupabaseClient | null = null;
export function getServerSupabase(): SupabaseClient | null {
  if (!_serverClient) {
    _serverClient = createServerClient();
  }
  return _serverClient;
}
