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
          <div className="text-4xl mb-3">📋</div>
          <p>タスクを選択してください</p>
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
      {/* ヘッダー */}
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
                {CHANNEL_CONFIG[task.sourceChannel].label}から
              </span>
            )}
          </div>
          <Button
            variant="secondary"
            onClick={handleStatusChange}
            className="text-xs"
          >
            {task.status === 'todo'
              ? '▶ 開始'
              : task.status === 'in_progress'
              ? '✅ 完了'
              : '↩ 戻す'}
          </Button>
        </div>
        <h2 className="text-base font-bold text-slate-900">{task.title}</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          作成: {formatRelativeTime(task.createdAt)} ・ 更新: {formatRelativeTime(task.updatedAt)}
        </p>
      </div>

      {/* タブ */}
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
          🤖 AI会話
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
          📋 詳細
        </button>
      </div>

      {/* コンテンツ */}
      {activeTab === 'chat' ? (
        <TaskAiChat
          task={task}
          onPhaseChange={handlePhaseChange}
          onTaskUpdate={onRefresh}
        />
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 進捗サマリー */}
          <div className="p-3 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100">
            <div className="flex items-center justify-between mb-2">
              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', phaseConfig.color)}>
                {phaseConfig.icon} {phaseConfig.label}
              </span>
              <span className="text-[10px] text-slate-400">
                作成 {formatRelativeTime(task.createdAt)}
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

          {/* 説明 */}
          <div>
            <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              📝 概要
            </h3>
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              {task.description || '説明なし'}
            </p>
          </div>

          {/* 構想メモ（構造化表示） */}
          {task.ideationSummary && (
            <div>
              <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                💡 構想メモ
              </h3>
              <div className="space-y-2">
                {(task.ideationSummary ?? '').split('\n').map((line, idx) => {
                  const match = line.match(/^【(.+?)】(.+)$/);
                  if (match) {
                    const label = match[1];
                    const value = match[2];
                    const iconMap: Record<string, string> = {
                      'ゴール': '🎯',
                      '主な内容': '📋',
                      '気になる点': '⚠️',
                      '期限日': '📅',
                    };
                    return (
                      <div key={idx} className="p-2.5 bg-amber-50 rounded-lg border border-amber-100">
                        <div className="text-[10px] font-semibold text-amber-600 mb-0.5">
                          {iconMap[label] || '📌'} {label}
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

          {/* 結果要約 */}
          {task.resultSummary && (
            <div>
              <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                ✅ 結果要約
              </h3>
              <div className="p-3 bg-green-50 rounded-lg border border-green-100 text-sm text-green-800 whitespace-pre-wrap leading-relaxed">
                {task.resultSummary}
              </div>
            </div>
          )}

          {/* ソース情報 */}
          {task.sourceChannel && (
            <div>
              <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                📨 起点メッセージ
              </h3>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium',
                    CHANNEL_CONFIG[task.sourceChannel].bgColor,
                    CHANNEL_CONFIG[task.sourceChannel].textColor
                  )}>
                    {CHANNEL_CONFIG[task.sourceChannel].label}
                  </span>
                  <span className="text-slate-400">から作成</span>
                </div>
              </div>
            </div>
          )}

          {/* タグ */}
          <div>
            <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              🏷️ タグ
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
                <span className="text-xs text-slate-400">タグなし</span>
              )}
            </div>
          </div>

          {/* タイムライン & 会話統計 */}
          <div>
            <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              📊 アクティビティ
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span className="text-xs text-slate-600">構想</span>
                </div>
                <span className="text-xs font-medium text-slate-700">
                  {(task.conversations ?? []).filter((c) => c.phase === 'ideation').length}件
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span className="text-xs text-slate-600">進行</span>
                </div>
                <span className="text-xs font-medium text-slate-700">
                  {(task.conversations ?? []).filter((c) => c.phase === 'progress').length}件
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  <span className="text-xs text-slate-600">結果</span>
                </div>
                <span className="text-xs font-medium text-slate-700">
                  {(task.conversations ?? []).filter((c) => c.phase === 'result').length}件
                </span>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">最終更新</span>
              <span className="text-[10px] text-slate-500 font-medium">
                {formatRelativeTime(task.updatedAt)}
              </span>
            </div>
            {task.completedAt && (
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-slate-400">完了日</span>
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
