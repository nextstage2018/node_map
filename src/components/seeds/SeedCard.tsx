'use client';

import { useState } from 'react';
import type { Seed } from '@/lib/types';
import { CHANNEL_CONFIG } from '@/lib/constants';
import Image from 'next/image';

interface SeedCardProps {
  seed: Seed;
  onConfirm: () => Promise<unknown>;
}

export default function SeedCard({ seed, onConfirm }: SeedCardProps) {
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await onConfirm();
    } finally {
      setIsConfirming(false);
    }
  };

  const channelConfig = seed.sourceChannel
    ? CHANNEL_CONFIG[seed.sourceChannel]
    : null;

  const timeAgo = (() => {
    const diff = Date.now() - new Date(seed.createdAt).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'たった今';
    if (hours < 24) return `${hours}時間前`;
    return `${Math.floor(hours / 24)}日前`;
  })();

  return (
    <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100
      hover:border-slate-200 transition-colors group">
      {/* 種アイコン */}
      <span className="text-sm mt-0.5 shrink-0">🌱</span>

      {/* コンテンツ */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-700 line-clamp-2">{seed.content}</p>
        <div className="mt-1 flex items-center gap-2">
          {channelConfig && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Image
                src={channelConfig.icon}
                alt={channelConfig.label}
                width={12}
                height={12}
              />
              {channelConfig.label}
            </span>
          )}
          <span className="text-xs text-slate-400">{timeAgo}</span>
        </div>
      </div>

      {/* タスク化ボタン */}
      <button
        onClick={handleConfirm}
        disabled={isConfirming}
        className="shrink-0 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50
          border border-blue-200 rounded-lg hover:bg-blue-100
          disabled:opacity-50 disabled:cursor-not-allowed
          opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {isConfirming ? '変換中...' : 'タスク化'}
      </button>
    </div>
  );
}
