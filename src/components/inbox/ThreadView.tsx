'use client';

import { ThreadMessage } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface ThreadViewProps {
  messages: ThreadMessage[];
}

export default function ThreadView({ messages }: ThreadViewProps) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-slate-200 bg-slate-50">
      <div className="px-6 py-3 border-b border-slate-200">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          💬 会話の履歴（{messages.length}件）
        </h3>
      </div>
      <div className="overflow-y-auto max-h-64 px-6 py-3 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex',
              msg.isOwn ? 'justify-end' : 'justify-start'
            )}
          >
            <div
              className={cn(
                'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
                msg.isOwn
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={cn(
                    'text-xs font-semibold',
                    msg.isOwn ? 'text-blue-100' : 'text-slate-500'
                  )}
                >
                  {msg.isOwn ? 'あなた' : msg.from.name}
                </span>
                <span
                  className={cn(
                    'text-[10px]',
                    msg.isOwn ? 'text-blue-200' : 'text-slate-400'
                  )}
                >
                  {formatRelativeTime(msg.timestamp)}
                </span>
              </div>
              <p className="whitespace-pre-wrap leading-relaxed text-[13px]">
                {msg.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
