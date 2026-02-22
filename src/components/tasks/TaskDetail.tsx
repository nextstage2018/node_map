'use client';

import { useState } from 'react';
import { Task, TaskPhase, UpdateTaskRequest } from '@/lib/types';
import {
  TASK_STATUS_CONFIG,
  TASK_PRIORITY_CONFIG,
  TASK_PHASE_CONFIG,
  CHANNEL_CONFIG,
} from '@/lib/constants';
import { formatRelativeTime, cn } from '@/lib/utils';
import Button from '@/components/ui/Button';
import TaskAiChat from './TaskAiChat';

interface TaskDetailProps {
  task: Task | null;
  onUpdate: (id: string, req: UpdateTaskRequest) => Promise<Task | undefined>;
  onRefresh: () => void;
}

export default function TaskDetail({ task, onUpdate, onRefresh }: TaskDetailProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'info'>('chat');

  if (!task) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <div className="text-center">
          <div className="text-4xl mb-3">ð</div>
          <p>ã¿ã¹ã¯ãé¸æãã¦ãã ãã</p>
        </div>
      </div>
    );
  }

  const statusConfig = TASK_STATUS_CONFIG[task.status];
  const priorityConfig = TASK_PRIORITY_CONFIG[task.priority];
  const phaseConfig = TASK_PHASE_CONFIG[task.phase];

  const handleStatusChange = async () => {
    const nextStatus =
      task.status === 'todo'
        ? 'in_progress'
        : task.status === 'in_progress'
        ? 'done'
        : 'todo';
    await onUpdate(task.id, { status: nextStatus });
    onRefresh();
  };

  const handlePhaseChange = (phase: TaskPhase) => {
    onUpdate(task.id, { phase });
    onRefresh();
  };

  return (
    <div className="flex flex-col h-full">
      {/* ãããã¼ */}
      <div className="px-4 py-3 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusConfig.color)}>
              {statusConfig.label}
            </span>
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-bold', priorityConfig.badgeColor)}>
              {priorityConfig.label}
            </span>
            {task.sourceChannel && (
              <span className="text-[10px] text-slate-400">
                {CHANNEL_CONFIG[task.sourceChannel].label}ãã
              </span>
            )}
          </div>
          <Button
            variant="secondary"
            onClick={handleStatusChange}
            className="text-xs"
          >
            {task.status === 'todo'
              ? 'â¶ éå§'
              : task.status === 'in_progress'
              ? 'â å®äº'
              : 'â© åé'}
          </Button>
        </div>
        <h2 className="text-base font-bold text-slate-900">{task.title}</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          ä½æ: {formatRelativeTime(task.createdAt)} ã» æ´æ°: {formatRelativeTime(task.updatedAt)}
        </p>
      </div>

      {/* ã¿ã */}
      <div className="flex border-b border-slate-200 bg-white">
        <button
          onClick={() => setActiveTab('chat')}
          className={cn(
            'flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'chat'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          )}
        >
          ð¤ AIä¼è©±
        </button>
        <button
          onClick={() => setActiveTab('info')}
          className={cn(
            'flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'info'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          )}
        >
          ð è©³ç´°
        </button>
      </div>

      {/* ã³ã³ãã³ã */}
      {activeTab === 'chat' ? (
        <TaskAiChat
          task={task}
          onPhaseChange={handlePhaseChange}
          onTaskUpdate={onRefresh}
        />
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* é²æãµããªã¼ */}
          <div className="p-3 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100">
            <div className="flex items-center justify-between mb-2">
              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', phaseConfig.color)}>
                {phaseConfig.icon} {phaseConfig.label}
              </span>
              <span className="text-[10px] text-slate-400">
                ä½æ {formatRelativeTime(task.createdAt)}
              </span>
            </div>
            <div className="flex items-center gap-1 mb-1.5">
              {(['ideation', 'progress', 'result'] as const).map((p, idx) => {
                const isPast =
                  (task.phase === 'progress' && p === 'ideation') ||
                  (task.phase === 'result' && p !== 'result');
                const isCurrent = task.phase === p;
                return (
                  <div
                    key={p}
                    className={cn(
                      'flex-1 h-1.5 rounded-full',
                      isCurrent ? 'bg-blue-500' : isPast ? 'bg-blue-400' : 'bg-slate-200'
                    )}
                  />
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500">
              {phaseConfig.description}
            </p>
          </div>

          {/* èª¬æ */}
          <div>
            <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              ð æ¦è¦
            </h3>
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              {task.description || 'èª¬æãªã'}
            </p>
          </div>

          {/* æ§æ³ã¡ã¢ï¼æ§é åè¡¨ç¤ºï¼ */}
          {task.ideationSummary && (
            <div>
              <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                ð¡ æ§æ³ã¡ã¢
              </h3>
              <div className="space-y-2">
                {(task.ideationSummary ?? '').split('\n').map((line, idx) => {
                  const match = line.match(/^ã(.+?)ã(.+)$/);
                  if (match) {
                    const label = match[1];
                    const value = match[2];
                    const iconMap: Record<string, string> = {
                      'ã´ã¼ã«': 'ð¯',
                      'ä¸»ãªåå®¹': 'ð',
                      'æ°ã«ãªãç¹': 'â ï¸',
                      'æéæ¥': 'ð',
                    };
                    return (
                      <div key={idx} className="p-2.5 bg-amber-50 rounded-lg border border-amber-100">
                        <div className="text-[10px] font-semibold text-amber-600 mb-0.5">
                          {iconMap[label] || 'ð'} {label}
                        </div>
                        <p className="text-sm text-amber-900">{value}</p>
                      </div>
                    );
                  }
                  return line.trim() ? (
                    <div key={idx} className="p-2.5 bg-amber-50 rounded-lg text-sm text-amber-800">
                      {line}
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          )}

          {/* çµæè¦ç´ */}
          {task.resultSummary && (
            <div>
              <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                â çµæè¦ç´
              </h3>
              <div className="p-3 bg-green-50 rounded-lg border border-green-100 text-sm text-green-800 whitespace-pre-wrap leading-relaxed">
                {task.resultSummary}
              </div>
            </div>
          )}

          {/* ã½ã¼ã¹æå ± */}
          {task.sourceChannel && (
            <div>
              <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                ð¨ èµ·ç¹ã¡ãã»ã¼ã¸
              </h3>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium',
                    CHANNEL_CONFIG[task.sourceChannel].bgColor,
                    CHANNEL_CONFIG[task.sourceChannel].textColor
                  )}>
                    {CHANNEL_CONFIG[task.sourceChannel].label}
                  </span>
                  <span className="text-slate-400">ããä½æ</span>
                </div>
              </div>
            </div>
          )}

          {/* ã¿ã° */}
          <div>
            <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              ð·ï¸ ã¿ã°
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {(task.tags ?? []).length > 0 ? (
                (task.tags ?? []).map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-medium"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-400">ã¿ã°ãªã</span>
              )}
            </div>
          </div>

          {/* ã¿ã¤ã ã©ã¤ã³ & ä¼è©±çµ±è¨ */}
          <div>
            <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              ð ã¢ã¯ãã£ããã£
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span className="text-xs text-slate-600">æ§æ³</span>
                </div>
                <span className="text-xs font-medium text-slate-700">
                  {(task.conversations ?? []).filter((c) => c.phase === 'ideation').length}ä»¶
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span className="text-xs text-slate-600">é²è¡</span>
                </div>
                <span className="text-xs font-medium text-slate-700">
                  {(task.conversations ?? []).filter((c) => c.phase === 'progress').length}ä»¶
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  <span className="text-xs text-slate-600">çµæ</span>
                </div>
                <span className="text-xs font-medium text-slate-700">
                  {(task.conversations ?? []).filter((c) => c.phase === 'result').length}ä»¶
                </span>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">æçµæ´æ°</span>
              <span className="text-[10px] text-slate-500 font-medium">
                {formatRelativeTime(task.updatedAt)}
              </span>
            </div>
            {task.completedAt && (
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-slate-400">å®äºæ¥</span>
                <span className="text-[10px] text-green-600 font-medium">
                  {formatRelativeTime(task.completedAt)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
