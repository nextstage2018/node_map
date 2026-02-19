'use client';

import { useState } from 'react';
import { TaskSuggestion, CreateTaskRequest } from '@/lib/types';
import { CHANNEL_CONFIG, TASK_PRIORITY_CONFIG } from '@/lib/constants';
import { cn, formatRelativeTime } from '@/lib/utils';
import Image from 'next/image';
import Button from '@/components/ui/Button';

interface TaskSuggestionsProps {
  suggestions: TaskSuggestion[];
  onAccept: (req: CreateTaskRequest) => Promise<void>;
  onDismiss: (index: number) => void;
}

export default function TaskSuggestions({
  suggestions,
  onAccept,
  onDismiss,
}: TaskSuggestionsProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  if (suggestions.length === 0) return null;

  const selected = selectedIdx !== null ? suggestions[selectedIdx] : null;

  return (
    <>
      {/* カラム型の提案リスト */}
      <div className="flex flex-col min-w-[260px] max-w-[300px] w-full">
        {/* カラムヘッダー */}
        <div className="flex items-center gap-2 px-3 py-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-purple-400" />
          <h3 className="text-sm font-semibold text-slate-700">AI提案</h3>
          <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
            {suggestions.length}
          </span>
        </div>

        {/* 提案カードリスト */}
        <div className="flex-1 overflow-y-auto space-y-2 px-1">
          {suggestions.map((suggestion, idx) => {
            const channelConfig = CHANNEL_CONFIG[suggestion.sourceChannel];
            const priorityConfig = TASK_PRIORITY_CONFIG[suggestion.priority];

            return (
              <div
                key={idx}
                onClick={() => setSelectedIdx(idx)}
                className={cn(
                  'p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm',
                  selectedIdx === idx
                    ? 'border-purple-400 bg-purple-50 shadow-sm'
                    : 'border-dashed border-purple-200 bg-white hover:border-purple-300'
                )}
              >
                {/* チャネル + 優先度 */}
                <div className="flex items-center gap-2 mb-1.5">
                  <Image
                    src={channelConfig.icon}
                    alt={channelConfig.label}
                    width={14}
                    height={14}
                    className="shrink-0"
                  />
                  <span className="text-[10px] text-slate-400">
                    {channelConfig.label}
                  </span>
                  <span className="text-[10px] text-slate-300">
                    {formatRelativeTime(suggestion.sourceDate)}
                  </span>
                  <span className={cn('ml-auto text-[10px] px-1.5 py-0.5 rounded font-bold', priorityConfig.badgeColor)}>
                    {priorityConfig.label}
                  </span>
                </div>

                {/* タイトル */}
                <h4 className="text-sm font-medium text-slate-900 leading-tight line-clamp-2 mb-1">
                  {suggestion.title}
                </h4>

                {/* 誰から */}
                <p className="text-[10px] text-slate-500 mb-1 truncate">
                  📨 {suggestion.sourceFrom}
                </p>

                {/* 元メッセージ抜粋 */}
                <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">
                  {suggestion.sourceExcerpt}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 提案詳細モーダル */}
      {selected && selectedIdx !== null && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setSelectedIdx(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div className="px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <Image
                  src={CHANNEL_CONFIG[selected.sourceChannel].icon}
                  alt={CHANNEL_CONFIG[selected.sourceChannel].label}
                  width={18}
                  height={18}
                />
                <span className="text-xs text-slate-400">
                  {CHANNEL_CONFIG[selected.sourceChannel].label}からの提案
                </span>
                <span className={cn('ml-auto text-xs px-2 py-0.5 rounded font-bold', TASK_PRIORITY_CONFIG[selected.priority].badgeColor)}>
                  優先度: {TASK_PRIORITY_CONFIG[selected.priority].label}
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                {selected.title}
              </h2>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* ソース元の情報 */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <h3 className="text-[10px] font-semibold text-slate-400 uppercase mb-2">
                  元メッセージ
                </h3>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-400 shrink-0 w-12">送信者</span>
                    <span className="font-medium text-slate-800">{selected.sourceFrom}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-400 shrink-0 w-12">日時</span>
                    <span className="text-slate-700">
                      {new Date(selected.sourceDate).toLocaleString('ja-JP', {
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      （{formatRelativeTime(selected.sourceDate)}）
                    </span>
                  </div>
                  {selected.sourceSubject && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-slate-400 shrink-0 w-12">件名</span>
                      <span className="text-slate-700">{selected.sourceSubject}</span>
                    </div>
                  )}
                </div>
                {/* メッセージ本文抜粋 */}
                <div className="mt-3 p-2.5 bg-white rounded border border-slate-100">
                  <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                    {selected.sourceExcerpt}
                  </p>
                </div>
              </div>

              {/* タスク内容 */}
              <div>
                <h3 className="text-[10px] font-semibold text-slate-400 uppercase mb-1">
                  提案タスク内容
                </h3>
                <p className="text-sm text-slate-700">{selected.description}</p>
              </div>

              {/* 提案理由 */}
              <div>
                <h3 className="text-[10px] font-semibold text-slate-400 uppercase mb-1">
                  AIの提案理由
                </h3>
                <div className="flex items-start gap-2 p-2.5 bg-purple-50 rounded-lg">
                  <span className="text-sm shrink-0">🤖</span>
                  <p className="text-sm text-purple-700">{selected.reason}</p>
                </div>
              </div>
            </div>

            {/* ボタン（3つ：却下・スキップ・タスクに追加） */}
            <div className="px-6 py-4 border-t border-slate-200 flex gap-2">
              <button
                onClick={() => {
                  onDismiss(selectedIdx);
                  setSelectedIdx(null);
                }}
                className="px-4 py-2 text-sm text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
              >
                却下
              </button>
              <div className="flex-1" />
              <button
                onClick={() => setSelectedIdx(null)}
                className="px-4 py-2 text-sm text-slate-500 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                あとで
              </button>
              <Button
                onClick={async () => {
                  await onAccept({
                    title: selected.title,
                    description: selected.description,
                    priority: selected.priority,
                    sourceMessageId: selected.sourceMessageId,
                    sourceChannel: selected.sourceChannel,
                  });
                  onDismiss(selectedIdx);
                  setSelectedIdx(null);
                }}
              >
                タスクに追加
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
