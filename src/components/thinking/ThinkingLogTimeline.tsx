'use client';

import { useState } from 'react';
import type { ThinkingLog, ThinkingLogType } from '@/lib/types';

// ログタイプの表示設定
const LOG_TYPE_DISPLAY: Record<ThinkingLogType, { label: string; icon: string; color: string; dotColor: string }> = {
  hypothesis: { label: '仮説', icon: '\uD83D\uDCA1', color: 'text-purple-700', dotColor: 'bg-purple-500' },
  observation: { label: '観察', icon: '\uD83D\uDC41', color: 'text-blue-700', dotColor: 'bg-blue-500' },
  insight: { label: '気づき', icon: '\u2728', color: 'text-green-700', dotColor: 'bg-green-500' },
  question: { label: '疑問', icon: '\u2753', color: 'text-yellow-700', dotColor: 'bg-yellow-500' },
};

interface ThinkingLogTimelineProps {
  logs: ThinkingLog[];
  onEdit: (log: ThinkingLog) => void;
  onDelete: (logId: string) => void;
  isLoading?: boolean;
}

export default function ThinkingLogTimeline({
  logs,
  onEdit,
  onDelete,
  isLoading = false,
}: ThinkingLogTimelineProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
        <span className="ml-2 text-sm text-slate-500">読み込み中...</span>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <p className="text-sm text-slate-400 text-center py-6">
        思考ログはまだありません。考えたことを記録してみましょう。
      </p>
    );
  }

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffH = Math.floor(diffMs / 3600000);

      if (diffH < 1) return 'たった今';
      if (diffH < 24) return `${diffH}時間前`;
      if (diffH < 48) return '昨日';
      return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const handleDelete = (logId: string) => {
    if (confirmDeleteId === logId) {
      onDelete(logId);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(logId);
    }
  };

  return (
    <div className="space-y-0">
      {logs.map((log, index) => {
        const display = LOG_TYPE_DISPLAY[log.logType] || LOG_TYPE_DISPLAY.observation;
        const isLast = index === logs.length - 1;

        return (
          <div key={log.id} className="flex gap-3 group">
            {/* タイムラインドット + ライン */}
            <div className="flex flex-col items-center">
              <div
                className={`w-3 h-3 rounded-full ${display.dotColor} shrink-0 mt-1.5`}
                title={display.label}
              />
              {!isLast && (
                <div className="w-px flex-1 bg-slate-200 min-h-[16px]" />
              )}
            </div>

            {/* コンテンツ */}
            <div className="flex-1 pb-4 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {/* タイプラベル + 時間 */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium ${display.color}`}>
                      {display.icon} {display.label}
                    </span>
                    <span className="text-[10px] text-slate-400">{formatTime(log.createdAt)}</span>
                  </div>

                  {/* 内容 */}
                  <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">
                    {log.content}
                  </p>

                  {/* タグ */}
                  {log.tags && log.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {log.tags.map((tag, i) => (
                        <span
                          key={i}
                          className="inline-flex px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* ノードリンク */}
                  {log.node && (
                    <div className="mt-1.5 text-[10px] text-slate-400">
                      {log.node.label}
                    </div>
                  )}
                </div>

                {/* アクションボタン */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => onEdit(log)}
                    className="px-2 py-1 text-[10px] text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => handleDelete(log.id)}
                    className={`px-2 py-1 text-[10px] rounded transition-colors ${
                      confirmDeleteId === log.id
                        ? 'text-white bg-red-500 hover:bg-red-600'
                        : 'text-red-500 hover:bg-red-50'
                    }`}
                  >
                    {confirmDeleteId === log.id ? '確認' : '削除'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
