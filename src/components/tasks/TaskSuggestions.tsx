'use client';

import { useState } from 'react';
import { TaskSuggestion, CreateTaskRequest } from '@/lib/types';
import { CHANNEL_CONFIG, TASK_PRIORITY_CONFIG } from '@/lib/constants';
import { cn } from '@/lib/utils';
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
          <h3 className="text-sm font-semibold text-gray-700">AI提案</h3>
          <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
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
                  <span className="text-[10px] text-gray-400">
                    {channelConfig.label}から
                  </span>
                  <span className="ml-auto text-xs">{priorityConfig.icon}</span>
                </div>

                {/* タイトル */}
                <h4 className="text-sm font-medium text-gray-900 leading-tight line-clamp-2 mb-1">
                  {suggestion.title}
                </h4>

                {/* 提案理由 */}
                <p className="text-[10px] text-purple-500">
                  🤖 {suggestion.reason}
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
            className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <Image
                  src={CHANNEL_CONFIG[selected.sourceChannel].icon}
                  alt={CHANNEL_CONFIG[selected.sourceChannel].label}
                  width={18}
                  height={18}
                />
                <span className="text-xs text-gray-400">
                  {CHANNEL_CONFIG[selected.sourceChannel].label}からの提案
                </span>
                <span className="ml-auto text-sm">
                  {TASK_PRIORITY_CONFIG[selected.priority].icon}{' '}
                  {TASK_PRIORITY_CONFIG[selected.priority].label}
                </span>
              </div>
              <h2 className="text-lg font-bold text-gray-900">
                {selected.title}
              </h2>
            </div>

            <div className="px-6 py-4 space-y-3">
              {/* 説明 */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">
                  内容
                </h3>
                <p className="text-sm text-gray-700">{selected.description}</p>
              </div>

              {/* 提案理由 */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">
                  提案理由
                </h3>
                <div className="flex items-start gap-2 p-2.5 bg-purple-50 rounded-lg">
                  <span className="text-sm">🤖</span>
                  <p className="text-sm text-purple-700">{selected.reason}</p>
                </div>
              </div>
            </div>

            {/* ボタン */}
            <div className="px-6 py-4 border-t border-gray-200 flex gap-2">
              <button
                onClick={() => {
                  onDismiss(selectedIdx);
                  setSelectedIdx(null);
                }}
                className="flex-1 px-4 py-2 text-sm text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                スキップ
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
                className="flex-1"
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
