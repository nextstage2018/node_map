'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { Job } from '@/lib/types';
import { JOB_STATUS_CONFIG, JOB_TYPE_CONFIG, TASK_PRIORITY_CONFIG } from '@/lib/constants';

interface JobCardProps {
  job: Job;
  onExecute: (jobId: string) => Promise<void>;
  onDismiss: (jobId: string) => Promise<void>;
}

export default function JobCard({ job, onExecute, onDismiss }: JobCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isActing, setIsActing] = useState(false);

  const statusConfig = JOB_STATUS_CONFIG[job.status];
  const typeConfig = JOB_TYPE_CONFIG[job.type];
  const priorityConfig = TASK_PRIORITY_CONFIG[job.priority];

  const handleAction = async (action: 'execute' | 'dismiss') => {
    setIsActing(true);
    try {
      if (action === 'execute') await onExecute(job.id);
      else await onDismiss(job.id);
    } finally {
      setIsActing(false);
    }
  };

  const timeAgo = (() => {
    const diff = Date.now() - new Date(job.updatedAt).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'たった今';
    if (hours < 24) return `${hours}時間前`;
    return `${Math.floor(hours / 24)}日前`;
  })();

  const isActionable = job.status === 'draft' || job.status === 'proposed';

  return (
    <div className="p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-colors">
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Image
            src={typeConfig.icon}
            alt={typeConfig.label}
            width={16}
            height={16}
            className="shrink-0"
          />
          <h4 className="text-sm font-medium text-slate-900 truncate">{job.title}</h4>
        </div>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${statusConfig.color}`}>
          {statusConfig.label}
        </span>
      </div>

      {/* 説明 */}
      <p className="mt-1 text-xs text-slate-500 line-clamp-2">{job.description}</p>

      {/* メタ情報 */}
      <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
        <span className={`px-1.5 py-0.5 rounded ${priorityConfig.color}`}>
          {priorityConfig.label}
        </span>
        <span>{typeConfig.label}</span>
        <span>{timeAgo}</span>
      </div>

      {/* 下書きプレビュー（展開時） */}
      {job.draftContent && (
        <>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-2 text-xs text-blue-600 hover:text-blue-700"
          >
            {isExpanded ? '下書きを閉じる' : '下書きを確認'}
          </button>
          {isExpanded && (
            <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-600 whitespace-pre-wrap">
              {job.draftContent}
            </div>
          )}
        </>
      )}

      {/* アクションボタン */}
      {isActionable && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => handleAction('execute')}
            disabled={isActing}
            className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600
              rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            実行する
          </button>
          <button
            onClick={() => handleAction('dismiss')}
            disabled={isActing}
            className="flex-1 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100
              rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors"
          >
            却下
          </button>
        </div>
      )}
    </div>
  );
}
