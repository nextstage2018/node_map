'use client';

import Image from 'next/image';
import { CHANNEL_CONFIG } from '@/lib/constants';
import { ChannelType } from '@/lib/types';
import { Inbox, CheckSquare, Map, Users, BookOpen, Settings, Target, FileText, AlertTriangle, Calendar, Lightbulb, ArrowRight, CheckCircle } from 'lucide-react';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  '/icons/nav-inbox.svg': Inbox,
  '/icons/nav-tasks.svg': CheckSquare,
  '/icons/nav-map.svg': Map,
  '/icons/nav-contacts.svg': Users,
  '/icons/nav-master.svg': BookOpen,
  '/icons/nav-settings.svg': Settings,
  '/icons/memo-goal.svg': Target,
  '/icons/memo-content.svg': FileText,
  '/icons/memo-concerns.svg': AlertTriangle,
  '/icons/memo-deadline.svg': Calendar,
  '/icons/phase-ideation.svg': Lightbulb,
  '/icons/phase-progress.svg': ArrowRight,
  '/icons/phase-result.svg': CheckCircle,
};

interface SidebarProps {
  messageCounts: Record<ChannelType, number>;
  unreadCounts: Record<ChannelType, number>;
  activeFilter?: ChannelType | 'all';
  onFilterChange?: (filter: ChannelType | 'all') => void;
}

export default function Sidebar({ messageCounts, unreadCounts, activeFilter = 'all', onFilterChange }: SidebarProps) {
  const channels: ChannelType[] = ['email', 'slack', 'chatwork'];
  const totalMessages = Object.values(messageCounts).reduce((a, b) => a + b, 0);
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  return (
    <aside className="w-56 border-r border-slate-200 bg-slate-50 p-4 shrink-0">
      <div>
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    チャンネル
        </h2>
        <ul className="space-y-1">
          {/* すべて */}
          <li
            onClick={() => onFilterChange?.('all')}
            className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
              activeFilter === 'all'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:bg-white'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {iconMap['/icons/nav-inbox.svg'] ? (() => { const Icon = iconMap['/icons/nav-inbox.svg']; return <Icon className="w-4 h-4 text-slate-500" />; })() : <Image src="/icons/nav-inbox.svg" alt="すべて" width={16} height={16} />}
                            すべて
            </span>
            <span className="flex items-center gap-1.5">
              {totalUnread > 0 && (
                <span className="bg-blue-600 text-white text-xs rounded-full px-2 py-0.5">
                  {totalUnread}
                </span>
              )}
            </span>
          </li>
          {/* 各チャネル */}
          {channels.map((ch) => {
            const config = CHANNEL_CONFIG[ch];
            const count = messageCounts[ch];
            const unread = unreadCounts[ch] || 0;
            const isActive = activeFilter === ch;
            return (
              <li
                key={ch}
                onClick={() => onFilterChange?.(ch)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm font-medium'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <Image
                    src={config.icon}
                    alt={config.label}
                    width={16}
                    height={16}
                    className="shrink-0"
                  />
                  {config.label}
                </span>
                <span className="flex items-center gap-1.5">
                  {unread > 0 && (
                    <span className="bg-blue-600 text-white text-xs rounded-full px-2 py-0.5">
                      {unread}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
