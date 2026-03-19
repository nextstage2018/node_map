'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Inbox, Building2, Settings,
  ChevronLeft, ChevronRight, BookOpen, CheckSquare,
  CircleCheck, CircleAlert, Circle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

// v4.0: タスク管理ページ追加（秘書とインボックスの間）
const NAV_ITEMS = [
  { href: '/', label: 'ホーム', icon: LayoutDashboard },
  { href: '/tasks', label: 'タスク', icon: CheckSquare },
  { href: '/inbox', label: 'インボックス', icon: Inbox, hasBadge: true },
  { href: '/organizations', label: '組織・プロジェクト', icon: Building2 },
  { href: '/settings', label: '設定', icon: Settings, hasTokenAlert: true },
  { href: '/guide', label: 'ガイド', icon: BookOpen },
];

// 認証状態の型
interface AuthStatus {
  loginEmail: string;
  google: { connected: boolean; email: string; mismatch: boolean };
  slack: { connected: boolean; name: string };
  chatwork: { connected: boolean; name: string };
}

export default function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [hasTokenIssue, setHasTokenIssue] = useState(false);

  // 未読数をAPIから取得
  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const res = await fetch('/api/inbox?limit=1');
        if (res.ok) {
          const data = await res.json();
          if (typeof data.unreadCount === 'number') {
            setUnreadCount(data.unreadCount);
          }
        }
      } catch {
        // 取得失敗時はバッジ非表示（0のまま）
      }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, []);

  // 認証状態を取得
  useEffect(() => {
    const fetchAuth = async () => {
      try {
        const [tokensRes, profileRes] = await Promise.all([
          fetch('/api/settings/tokens'),
          fetch('/api/settings/profile'),
        ]);
        const tokensData = await tokensRes.json();
        const profileData = await profileRes.json();
        const loginEmail = profileData.data?.email || '';
        const status: AuthStatus = {
          loginEmail,
          google: { connected: false, email: '', mismatch: false },
          slack: { connected: false, name: '' },
          chatwork: { connected: false, name: '' },
        };
        if (tokensData.success && tokensData.data) {
          for (const t of tokensData.data) {
            if (t.service_name === 'gmail' && t.is_active) {
              const email = t.token_data?.email || '';
              status.google = {
                connected: true,
                email,
                mismatch: !!(loginEmail && email && loginEmail !== email),
              };
            } else if (t.service_name === 'slack' && t.is_active) {
              // 個人名を優先表示（なければワークスペース名）
              const slackName = t.token_data?.authed_user_name || t.token_data?.team_name || 'Slack';
              status.slack = { connected: true, name: slackName };
            } else if (t.service_name === 'chatwork' && t.is_active) {
              status.chatwork = { connected: true, name: t.token_data?.account_name || 'CW' };
            }
          }
        }
        setAuthStatus(status);
      } catch {
        // 取得失敗時は非表示
      }
    };
    fetchAuth();

    // v10.4: トークンヘルスチェック（バックグラウンド）
    const checkTokenHealth = async () => {
      try {
        const res = await fetch('/api/settings/token-health');
        const data = await res.json();
        if (data.success && data.data) {
          setHasTokenIssue(data.data.hasIssues === true);
        }
      } catch {
        // サイレントフェイル
      }
    };
    checkTokenHealth();
  }, []);

  return (
    <aside
      className={cn(
        'h-screen bg-white border-r border-slate-200 flex flex-col shrink-0 transition-all duration-200',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* ロゴ */}
      <div className="h-14 flex items-center px-4 border-b border-slate-100">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">NM</span>
          </div>
          {!collapsed && (
            <span className="text-sm font-bold text-slate-900">NodeMap</span>
          )}
        </Link>
      </div>

      {/* ナビゲーション */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        <div className="space-y-1">
          {NAV_ITEMS.map((item) => {
            // ホームはパスが / 完全一致のみアクティブ
            const isActive = item.href === '/'
              ? pathname === '/'
              : (pathname === item.href || pathname?.startsWith(item.href + '/'));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'relative flex items-center gap-2.5 text-sm font-medium transition-colors',
                  collapsed ? 'justify-center rounded-lg px-2 py-2.5' : 'rounded-r-lg px-3 py-2.5',
                  isActive
                    ? cn(
                        'bg-blue-50 text-blue-700',
                        !collapsed && 'border-l-[3px] border-blue-500'
                      )
                    : cn(
                        'text-slate-600 hover:text-slate-900 hover:bg-slate-50',
                        !collapsed && 'border-l-[3px] border-transparent'
                      ),
                  // ホームリンクを少し目立たせる
                  item.href === '/' && !isActive && 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
                )}
              >
                <Icon className="w-[18px] h-[18px] shrink-0" />
                {!collapsed && (
                  <span className="flex-1">{item.label}</span>
                )}
                {/* 未読バッジ（インボックス） */}
                {item.hasBadge && unreadCount > 0 && (
                  collapsed ? (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold px-1">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  ) : (
                    <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-blue-600 text-white text-[11px] font-bold px-1.5">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )
                )}
                {/* v10.4: トークン問題バッジ（設定アイコン） */}
                {'hasTokenAlert' in item && item.hasTokenAlert && hasTokenIssue && (
                  collapsed ? (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="トークンに問題があります" />
                  )
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* 認証状態カード */}
      {authStatus && (
        <div className={cn(
          'border-t border-slate-100',
          collapsed ? 'px-2 py-2' : 'px-3 py-2.5'
        )}>
          {collapsed ? (
            // 折りたたみ時: アイコンのみ（不一致時は赤ドット）
            <Link href="/settings" title="認証状態" className="flex flex-col items-center gap-1.5">
              {authStatus.google.mismatch ? (
                <CircleAlert className="w-4 h-4 text-red-500" />
              ) : authStatus.google.connected ? (
                <CircleCheck className="w-4 h-4 text-green-500" />
              ) : (
                <Circle className="w-4 h-4 text-slate-300" />
              )}
            </Link>
          ) : (
            // 展開時: 詳細カード
            <Link href="/settings" className="block">
              <div className={cn(
                'rounded-lg p-2.5 text-xs transition-colors',
                authStatus.google.mismatch
                  ? 'bg-red-50 border border-red-200 hover:bg-red-100'
                  : 'bg-slate-50 border border-slate-200 hover:bg-slate-100'
              )}>
                {/* ログインユーザー */}
                <p className="text-[10px] text-slate-400 mb-1.5 truncate">
                  {authStatus.loginEmail || 'ログイン中'}
                </p>

                {/* Google */}
                <div className="flex items-center gap-1.5 mb-1">
                  {authStatus.google.connected ? (
                    authStatus.google.mismatch ? (
                      <CircleAlert className="w-3 h-3 text-red-500 shrink-0" />
                    ) : (
                      <CircleCheck className="w-3 h-3 text-green-500 shrink-0" />
                    )
                  ) : (
                    <Circle className="w-3 h-3 text-slate-300 shrink-0" />
                  )}
                  <span className={cn(
                    'truncate',
                    authStatus.google.mismatch ? 'text-red-700 font-medium' : 'text-slate-600'
                  )}>
                    {authStatus.google.connected
                      ? `G: ${authStatus.google.email}`
                      : 'Google 未接続'}
                  </span>
                </div>

                {/* Google不一致警告 */}
                {authStatus.google.mismatch && (
                  <p className="text-[10px] text-red-600 mb-1.5 pl-[18px]">
                    アカウント不一致
                  </p>
                )}

                {/* Slack & Chatwork */}
                <div className="flex items-center gap-1.5 mb-1">
                  {authStatus.slack.connected ? (
                    <CircleCheck className="w-3 h-3 text-green-500 shrink-0" />
                  ) : (
                    <Circle className="w-3 h-3 text-slate-300 shrink-0" />
                  )}
                  <span className="text-slate-600 truncate">
                    {authStatus.slack.connected ? `S: ${authStatus.slack.name}` : 'Slack 未接続'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {authStatus.chatwork.connected ? (
                    <CircleCheck className="w-3 h-3 text-green-500 shrink-0" />
                  ) : (
                    <Circle className="w-3 h-3 text-slate-300 shrink-0" />
                  )}
                  <span className="text-slate-600 truncate">
                    {authStatus.chatwork.connected ? `CW: ${authStatus.chatwork.name}` : 'CW 未接続'}
                  </span>
                </div>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* 折りたたみボタン */}
      <div className="border-t border-slate-100 p-2.5">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 py-2 text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span>折りたたむ</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
