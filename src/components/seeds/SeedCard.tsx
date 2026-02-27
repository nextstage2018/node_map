'use client';

import { useState } from 'react';
import type { Seed } from '@/lib/types';
import { CHANNEL_CONFIG } from '@/lib/constants';
import Image from 'next/image';

interface SeedCardProps {
  seed: Seed;
  onConfirm: () => Promise<unknown>;
  onUpdate?: (content: string, tags: string[]) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export default function SeedCard({ seed, onConfirm, onUpdate, onDelete }: SeedCardProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(seed.content);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await onConfirm();
    } finally {
      setIsConfirming(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editContent.trim() || !onUpdate) return;
    await onUpdate(editContent.trim(), []);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete();
    } finally {
      setIsDeleting(false);
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
      <span className="text-sm mt-0.5 shrink-0">{'\uD83C\uDF31'}</span>

      {/* コンテンツ */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm
                focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
            />
            <div className="flex gap-2">
              <button
                onClick={handleSaveEdit}
                className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
              >
                保存
              </button>
              <button
                onClick={() => { setIsEditing(false); setEditContent(seed.content); }}
                className="px-3 py-1 text-xs font-medium text-slate-500 bg-slate-100 rounded hover:bg-slate-200"
              >
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-700 line-clamp-2">{seed.content}</p>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              {seed.projectName && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full border border-blue-100">
                  📁 {seed.projectName}
                </span>
              )}
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
              {seed.sourceFrom && (
                <span className="text-xs text-slate-400">from: {seed.sourceFrom}</span>
              )}
              <span className="text-xs text-slate-400">{timeAgo}</span>
            </div>
          </>
        )}
      </div>

      {/* アクションボタン */}
      {!isEditing && (
        <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onUpdate && (
            <button
              onClick={() => setIsEditing(true)}
              className="px-2 py-1.5 text-xs font-medium text-slate-500
                bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200
                transition-colors"
              title="編集"
            >
              編集
            </button>
          )}
          {onDelete && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="px-2 py-1.5 text-xs font-medium text-red-500
                bg-red-50 border border-red-200 rounded-lg hover:bg-red-100
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors"
              title="削除"
            >
              {isDeleting ? '...' : '削除'}
            </button>
          )}
          <button
            onClick={handleConfirm}
            disabled={isConfirming}
            className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50
              border border-blue-200 rounded-lg hover:bg-blue-100
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors"
          >
            {isConfirming ? '変換中...' : 'タスク化'}
          </button>
        </div>
      )}
    </div>
  );
}
