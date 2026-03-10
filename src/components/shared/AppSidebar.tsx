'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bot, Inbox, Building2, Settings,
  ChevronLeft, ChevronRight, BookOpen, CheckSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

// v4.0: タスク管理ページ追加（秘書とインボックスの間）
const NAV_ITEMS = [
  { href: '/', label: '秘書', icon: Bot },
  { href: '/tasks', label: 'タスク', icon: CheckSquare },
  { href: '/inbox', label: 'インボックス', icon: Inbox, hasBadge: true },
  { href: '/organizations', label: '組織・プロジェクト', icon: Building2 },
  { href: '/settings', label: '設定', icon: Settings },
  { href: '/guide', label: 'ガイド', icon: BookOpen },
];

export default function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // 未読数をAPIから取得
  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const res = await fetch('/api/inbox?limit=1');
        if (res.ok) {
          const data = await res.json();
          // unreadCount がレスポンスに含まれていれば使用
          if (typeof data.unreadCount === 'number') {
            setUnreadCount(data.unreadCount);
          }
        }
      } catch {
        // 取得失敗時はバッジ非表示（0のまま）
      }
    };
    fetchUnread();
    // 60秒ごとにポーリング
    const interval = setInterval(fetchUnread, 60000);
    return () => clearInterval(interval);
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
            // ホーム（秘書）はパスが / 完全一致のみアクティブ
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
                  // 秘書リンクを少し目立たせる
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
              </Link>
            );
          })}
        </div>
      </nav>

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
