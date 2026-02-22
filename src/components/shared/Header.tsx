'use client';

import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { APP_NAME } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import { LogOut } from 'lucide-react';

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isDemo, signOut } = useAuth();

  const navItems = [
    { href: '/inbox', label: 'インボックス', icon: '/icons/nav-inbox.svg', enabled: true },
    { href: '/tasks', label: 'タスク', icon: '/icons/nav-tasks.svg', enabled: true },
    { href: '/settings', label: '設定', icon: '/icons/nav-settings.svg', enabled: true },
    { href: '/nodemap', label: '思考マップ', icon: '/icons/nav-map.svg', enabled: true },
    { href: '/master', label: 'ナレッジマスタ', icon: '/icons/nav-master.svg', enabled: true },
    { href: '/contacts', label: 'コンタクト', icon: '/icons/nav-contacts.svg', enabled: true },
  ];

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  return (
    <header className="h-14 border-b border-slate-200 bg-white flex items-center px-6 shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm">N</span>
        </div>
        <h1 className="text-lg font-bold text-slate-900">{APP_NAME}</h1>
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
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                <Image src={item.icon} alt={item.label} width={16} height={16} />
                {item.label}
              </span>
            </a>
          ) : (
            <span
              key={item.href}
              className="px-3 py-1.5 rounded-lg text-sm text-slate-400 cursor-not-allowed"
            >
              <span className="inline-flex items-center gap-1.5">
                <Image src={item.icon} alt={item.label} width={16} height={16} />
                {item.label}
              </span>
            </span>
          )
        )}
      </nav>
      <div className="ml-auto flex items-center gap-3">
        {!isDemo && user && (
          <span className="text-xs text-slate-400 hidden sm:block">
            {user.email}
          </span>
        )}
        {isDemo && (
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
            デモ
          </span>
        )}
        {!isDemo && (
          <button
            onClick={handleSignOut}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="ログアウト"
          >
            <LogOut size={18} />
          </button>
        )}
      </div>
    </header>
  );
}
