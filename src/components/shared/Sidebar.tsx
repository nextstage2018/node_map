'use client';

import Image from 'next/image';
import { CHANNEL_CONFIG } from '@/lib/constants';
import { ChannelType } from '@/lib/types';

interface SidebarProps {
  messageCounts: Record<ChannelType, number>;
  unreadCounts: Record<ChannelType, number>;
}

export default function Sidebar({ messageCounts, unreadCounts }: SidebarProps) {
  const channels: ChannelType[] = ['email', 'slack', 'chatwork'];
  const totalMessages = Object.values(messageCounts).reduce((a, b) => a + b, 0);

  return (
    <aside className="w-56 border-r border-slate-200 bg-slate-50 p-4 shrink-0">
      <div>
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          チャネル
        </h2>
        <ul className="space-y-1">
          <li className="flex items-center justify-between px-3 py-2 rounded-lg bg-white text-sm font-medium text-slate-900">
            <span className="inline-flex items-center gap-2">
              <Image src="/icons/nav-inbox.svg" alt="すべて" width={16} height={16} />
              すべて
            </span>
            {totalMessages > 0 && (
              <span className="bg-blue-600 text-white text-xs rounded-full px-2 py-0.5">
                {totalMessages}
              </span>
            )}
          </li>
          {channels.map((ch) => {
            const config = CHANNEL_CONFIG[ch];
            const count = messageCounts[ch];
            return (
              <li
                key={ch}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-white transition-colors"
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
                {count > 0 && (
                  <span className="text-xs text-slate-400">
                    {count}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
