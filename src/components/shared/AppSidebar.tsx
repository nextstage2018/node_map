'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bot, Inbox, CheckSquare, Zap, Lightbulb,
  ClipboardList, GitBranch, BookOpen,
  Users, Building2, Settings,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

// Phase A-1: ナビゲーション再構成（秘書ファースト）
const NAV_GROUPS = [
  {
    label: '',  // トップレベル（ラベルなし）
    items: [
      { href: '/', label: '秘書', icon: Bot },
    ],
  },
  {
    label: 'コミュニケーション',
    items: [
      { href: '/inbox', label: 'インボックス', icon: Inbox },
    ],
  },
  {
    label: 'ワーク',
    items: [
      { href: '/tasks', label: 'タスク', icon: CheckSquare },
      { href: '/jobs', label: 'ジョブ', icon: Zap },
      { href: '/memos', label: 'アイデアメモ', icon: Lightbulb },
      { href: '/business-log', label: 'ビジネスログ', icon: ClipboardList },
    ],
  },
  {
    label: 'ナレッジ',
    items: [
      { href: '/thought-map', label: '思考マップ', icon: GitBranch },
      { href: '/master', label: 'ナレッジ', icon: BookOpen },
    ],
  },
  {
    label: 'つながり',
    items: [
      { href: '/contacts', label: 'コンタクト', icon: Users },
      { href: '/organizations', label: '組織', icon: Building2 },
    ],
  },
  {
    label: 'システム',
    items: [
      { href: '/settings', label: '設定', icon: Settings },
    ],
  },
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
      <nav className="flex-1 overflow-y-auto py-3 px-2.5">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} className={cn('mb-4', gi === 0 ? '' : '')}>
            {!collapsed && group.label && (
              <p className="px-2.5 mb-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
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
                      'flex items-center gap-2.5 rounded-lg text-sm font-medium transition-colors',
                      collapsed ? 'justify-center px-2 py-2.5' : 'px-2.5 py-2',
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50',
                      // 秘書リンクを少し目立たせる
                      item.href === '/' && !isActive && 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
                    )}
                  >
                    <Icon className="w-[18px] h-[18px] shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
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
