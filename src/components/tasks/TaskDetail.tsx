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
      <div className="flex items-center justify-center h-full text-gray-400">
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
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusConfig.color)}>
              {statusConfig.label}
            </span>
            <span className="text-xs">
              {priorityConfig.icon} {priorityConfig.label}
            </span>
            {task.sourceChannel && (
              <span className="text-[10px] text-gray-400">
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
              : '↩ 再開'}
          </Button>
        </div>
        <h2 className="text-base font-bold text-gray-900">{task.title}</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          作成: {formatRelativeTime(task.createdAt)} ・ 更新: {formatRelativeTime(task.updatedAt)}
        </p>
      </div>

      {/* タブ */}
      <div className="flex border-b border-gray-200 bg-white">
        <button
          onClick={() => setActiveTab('chat')}
          className={cn(
            'flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'chat'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-400 hover:text-gray-600'
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
              : 'border-transparent text-gray-400 hover:text-gray-600'
          )}
        >
          📝 詳細
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
          {/* 説明 */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">
              説明
            </h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {task.description || '説明なし'}
            </p>
          </div>

          {/* フェーズ */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">
              現在のフェーズ
            </h3>
            <span className={cn('text-xs px-2 py-1 rounded-full', phaseConfig.color)}>
              {phaseConfig.icon} {phaseConfig.label} - {phaseConfig.description}
            </span>
          </div>

          {/* 構想メモ */}
          {task.ideationSummary && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">
                💡 構想メモ
              </h3>
              <div className="p-3 bg-amber-50 rounded-lg text-sm text-amber-800 whitespace-pre-wrap">
                {task.ideationSummary}
              </div>
            </div>
          )}

          {/* 結果要約 */}
          {task.resultSummary && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">
                ✅ 結果要約
              </h3>
              <div className="p-3 bg-green-50 rounded-lg text-sm text-green-800 whitespace-pre-wrap">
                {task.resultSummary}
              </div>
            </div>
          )}

          {/* タグ */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">
              タグ
            </h3>
            <div className="flex flex-wrap gap-1">
              {task.tags.length > 0 ? (
                task.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-xs text-gray-400">タグなし</span>
              )}
            </div>
          </div>

          {/* 会話統計 */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">
              会話統計
            </h3>
            <div className="text-sm text-gray-600">
              <p>
                構想: {task.conversations.filter((c) => c.phase === 'ideation').length}件
              </p>
              <p>
                進行: {task.conversations.filter((c) => c.phase === 'progress').length}件
              </p>
              <p>
                結果: {task.conversations.filter((c) => c.phase === 'result').length}件
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
