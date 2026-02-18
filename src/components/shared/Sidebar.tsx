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
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  return (
    <aside className="w-56 border-r border-gray-200 bg-gray-50 p-4 shrink-0">
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          チャネル
        </h2>
        <ul className="space-y-1">
          <li className="flex items-center justify-between px-3 py-2 rounded-lg bg-white text-sm font-medium text-gray-900">
            <span>📥 すべて</span>
            {totalUnread > 0 && (
              <span className="bg-blue-600 text-white text-xs rounded-full px-2 py-0.5">
                {totalUnread}
              </span>
            )}
          </li>
          {channels.map((ch) => {
            const config = CHANNEL_CONFIG[ch];
            return (
              <li
                key={ch}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-white transition-colors"
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
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">
                    {messageCounts[ch]}
                  </span>
                  {unreadCounts[ch] > 0 && (
                    <span className={`text-xs rounded-full px-1.5 py-0.5 ${config.bgColor} ${config.textColor}`}>
                      {unreadCounts[ch]}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          ステータス
        </h2>
        <div className="text-xs text-gray-400 px-3">
          <p>📡 API連携: デモモード</p>
          <p className="mt-1">💡 APIキーを設定すると実データに切り替わります</p>
        </div>
      </div>
    </aside>
  );
}
