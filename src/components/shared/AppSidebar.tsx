'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2, Settings,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

// v3.0: サイドメニュー2項目（NodeMap = 構造化データ保管庫。秘書・インボックスはClaude+MCPに移行）
const NAV_ITEMS = [
  { href: '/organizations', label: '組織・プロジェクト', icon: Building2 },
  { href: '/settings', label: '設定', icon: Settings },
];

export default function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'h-screen bg-white border-r border-slate-200 flex flex-col shrink-0 transition-all duration-200',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* ロゴ */}
      <div className="h-14 flex items-center px-4 border-b border-slate-100">
        <Link href="/organizations" className="flex items-center gap-2.5">
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
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
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
                )}
              >
                <Icon className="w-[18px] h-[18px] shrink-0" />
                {!collapsed && (
                  <span className="flex-1">{item.label}</span>
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
