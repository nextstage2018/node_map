'use client';

import { usePathname } from 'next/navigation';
import { APP_NAME } from '@/lib/constants';
import { cn } from '@/lib/utils';

export default function Header() {
  const pathname = usePathname();

  const navItems = [
    { href: '/inbox', label: '📥 インボックス', enabled: true },
    { href: '/tasks', label: '📋 タスク', enabled: true },
    { href: '/settings', label: '⚙️ 設定', enabled: true },
    { href: '/nodemap', label: '🧠 思考マップ', enabled: true },
  ];

  return (
    <header className="h-14 border-b border-gray-200 bg-white flex items-center px-6 shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm">N</span>
        </div>
        <h1 className="text-lg font-bold text-gray-900">{APP_NAME}</h1>
      </div>
      <nav className="ml-8 flex items-center gap-1">
        {navItems.map((item) =>
          item.enabled ? (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                pathname === item.href || pathname?.startsWith(item.href + '/')
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              )}
            >
              {item.label}
            </a>
          ) : (
            <span
              key={item.href}
              className="px-3 py-1.5 rounded-lg text-sm text-gray-400 cursor-not-allowed"
            >
              {item.label}
            </span>
          )
        )}
      </nav>
    </header>
  );
}
