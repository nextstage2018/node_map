'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Inbox, CheckSquare, Map, Users, BookOpen, Settings, ClipboardList, Bot, Building2, Sprout } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/inbox', label: 'インボックス', icon: Inbox },
  { href: '/tasks', label: 'タスク', icon: CheckSquare },
  { href: '/seeds', label: '種ボックス', icon: Sprout },
  { href: '/nodemap', label: '思考マップ', icon: Map },
  { href: '/contacts', label: 'コンタクト', icon: Users },
  { href: '/organizations', label: '組織', icon: Building2 },
  { href: '/master', label: 'ナレッジ', icon: BookOpen },
  { href: '/business-log', label: 'ビジネスログ', icon: ClipboardList },
  { href: '/agent', label: '秘書', icon: Bot },
  { href: '/settings', label: '設定', icon: Settings },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="h-12 border-b border-slate-200 bg-white flex items-center justify-between px-4 shrink-0">
      {/* ロゴ */}
      <Link href="/inbox" className="flex items-center gap-2">
        <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
          <span className="text-white text-xs font-bold">NM</span>
        </div>
        <span className="text-sm font-bold text-slate-900 hidden sm:inline">NodeMap</span>
      </Link>

      {/* ナビゲーション */}
      <nav className="flex items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden md:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 右側: ユーザーアイコン */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center">
          <span className="text-[10px] text-slate-500 font-bold">U</span>
        </div>
      </div>
    </header>
  );
}
