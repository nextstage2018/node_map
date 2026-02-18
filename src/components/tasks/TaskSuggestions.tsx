'use client';

import { TaskSuggestion, CreateTaskRequest } from '@/lib/types';
import { CHANNEL_CONFIG, TASK_PRIORITY_CONFIG } from '@/lib/constants';
import Image from 'next/image';

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
  if (suggestions.length === 0) return null;

  return (
    <div className="px-4 py-3 bg-blue-50 border-b border-blue-200">
      <h3 className="text-xs font-semibold text-blue-700 mb-2">
        🤖 AIからのタスク提案
      </h3>
      <div className="space-y-2">
        {suggestions.map((suggestion, idx) => {
          const channelConfig = CHANNEL_CONFIG[suggestion.sourceChannel];
          const priorityConfig = TASK_PRIORITY_CONFIG[suggestion.priority];

          return (
            <div
              key={idx}
              className="flex items-center gap-3 bg-white rounded-lg p-2.5 border border-blue-100"
            >
              <Image
                src={channelConfig.icon}
                alt={channelConfig.label}
                width={16}
                height={16}
                className="shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {suggestion.title}
                </p>
                <p className="text-[10px] text-gray-400">
                  {suggestion.reason}
                </p>
              </div>
              <span className="text-xs shrink-0">{priorityConfig.icon}</span>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() =>
                    onAccept({
                      title: suggestion.title,
                      description: suggestion.description,
                      priority: suggestion.priority,
                      sourceMessageId: suggestion.sourceMessageId,
                      sourceChannel: suggestion.sourceChannel,
                    })
                  }
                  className="text-[10px] px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  追加
                </button>
                <button
                  onClick={() => onDismiss(idx)}
                  className="text-[10px] px-2 py-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
