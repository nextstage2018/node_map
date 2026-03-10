// v4.0 Phase 2: タスク管理ページ（カンバンボード）
'use client';

import { useState } from 'react';
import { User, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import PersonalTaskBoard from '@/components/v4/PersonalTaskBoard';
import TeamTaskBoard from '@/components/v4/TeamTaskBoard';

type TabType = 'personal' | 'team';

export default function TasksPage() {
  const [activeTab, setActiveTab] = useState<TabType>('personal');

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-nm-bg">
      {/* ヘッダー */}
      <header className="shrink-0 bg-white border-b border-nm-border px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-nm-text">タスク</h1>
        </div>

        {/* タブ切替 */}
        <div className="flex gap-1 mt-3 bg-slate-100 rounded-lg p-1 w-fit">
          <button
            onClick={() => setActiveTab('personal')}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all',
              activeTab === 'personal'
                ? 'bg-white text-nm-primary shadow-sm'
                : 'text-nm-text-secondary hover:text-nm-text'
            )}
          >
            <User className="w-4 h-4" />
            個人タスク
          </button>
          <button
            onClick={() => setActiveTab('team')}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all',
              activeTab === 'team'
                ? 'bg-white text-nm-primary shadow-sm'
                : 'text-nm-text-secondary hover:text-nm-text'
            )}
          >
            <Users className="w-4 h-4" />
            チームタスク
          </button>
        </div>
      </header>

      {/* コンテンツ */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'personal' ? (
          <PersonalTaskBoard />
        ) : (
          <TeamTaskBoard />
        )}
      </main>
    </div>
  );
}
