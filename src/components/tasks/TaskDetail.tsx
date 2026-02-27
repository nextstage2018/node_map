'use client';

import { useState, useEffect } from 'react';
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

// スナップショット型
interface Snapshot {
  id: string;
  nodeIds: string[];
  summary: string;
  createdAt: string;
}

// フェーズタイムラインの定義
const PHASE_TIMELINE = [
  { key: 'created', label: '作成', icon: '🌱', color: 'bg-slate-400' },
  { key: 'ideation', label: '構想', icon: '💡', color: 'bg-amber-400' },
  { key: 'progress', label: '進行', icon: '🔧', color: 'bg-blue-400' },
  { key: 'result', label: '結果', icon: '📊', color: 'bg-purple-400' },
  { key: 'completed', label: '完了', icon: '✅', color: 'bg-green-500' },
] as const;

export default function TaskDetail({ task, onUpdate, onRefresh }: TaskDetailProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'info'>('chat');
  const [snapshots, setSnapshots] = useState<{
    initialGoal: Snapshot | null;
    finalLanding: Snapshot | null;
  }>({ initialGoal: null, finalLanding: null });

  // スナップショット取得
  useEffect(() => {
    if (!task?.id) return;
    setSnapshots({ initialGoal: null, finalLanding: null });

    const fetchSnapshots = async () => {
      try {
        const res = await fetch(`/api/nodes/snapshots?taskId=${task.id}`);
        const json = await res.json();
        if (json.success && json.data) {
          setSnapshots(json.data);
        }
      } catch { /* スナップショット取得失敗は無視 */ }
    };
    fetchSnapshots();
  }, [task?.id]);

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

  // フェーズタイムラインデータを構築
  const timelineEvents = PHASE_TIMELINE.map((phase) => {
    let timestamp: string | undefined;
    switch (phase.key) {
      case 'created': timestamp = task.createdAt; break;
      case 'ideation': timestamp = task.ideationAt; break;
      case 'progress': timestamp = task.progressAt; break;
      case 'result': timestamp = task.resultAt; break;
      case 'completed': timestamp = task.completedAt; break;
    }
    return { ...phase, timestamp };
  }).filter(e => e.key === 'created' || e.timestamp); // 作成は常に表示、他は記録ありのみ

  // 会話ハイライト（各フェーズの最初のユーザー発言を抽出）
  const conversationHighlights = (['ideation', 'progress', 'result'] as const)
    .map(phase => {
      const phaseConvs = (task.conversations ?? []).filter(c => c.phase === phase && c.role === 'user');
      if (phaseConvs.length === 0) return null;
      return {
        phase,
        first: phaseConvs[0],
        count: (task.conversations ?? []).filter(c => c.phase === phase).length,
      };
    })
    .filter(Boolean);

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
        {/* description をヘッダーに移動（常時表示） */}
        {task.description && (
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{task.description}</p>
        )}
        <p className="text-[10px] text-slate-400 mt-0.5">
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
          📊 変遷
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

          {/* フェーズタイムライン */}
          <div>
            <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              フェーズ変遷
            </h3>
            <div className="relative pl-6">
              {/* 縦線 */}
              <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-slate-200" />

              {timelineEvents.map((event, idx) => (
                <div key={event.key} className="relative flex items-start gap-3 pb-4 last:pb-0">
                  {/* ドット */}
                  <div className={cn(
                    'absolute left-[-15px] w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] border-2 border-white shadow-sm z-10',
                    event.timestamp ? event.color : 'bg-slate-200'
                  )}>
                    <span className="text-[9px]">{event.icon}</span>
                  </div>
                  {/* 内容 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-700">{event.label}</span>
                      {event.timestamp && (
                        <span className="text-[10px] text-slate-400">
                          {new Date(event.timestamp).toLocaleDateString('ja-JP', {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </span>
                      )}
                    </div>
                    {/* フェーズの会話数 */}
                    {event.key !== 'created' && event.key !== 'completed' && (
                      <span className="text-[10px] text-slate-400">
                        会話 {(task.conversations ?? []).filter(c => c.phase === event.key).length}件
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* スナップショット比較 */}
          {(snapshots.initialGoal || snapshots.finalLanding) && (
            <div>
              <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                出口想定 vs 着地点
              </h3>
              <div className="space-y-2">
                {/* 初期ゴール */}
                {snapshots.initialGoal && (
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-2 h-2 rounded-full bg-blue-400" />
                      <span className="text-[10px] font-semibold text-blue-600">出口想定（タスク作成時）</span>
                      <span className="text-[9px] text-slate-400 ml-auto">
                        {new Date(snapshots.initialGoal.createdAt).toLocaleDateString('ja-JP')}
                      </span>
                    </div>
                    <p className="text-xs text-blue-800 whitespace-pre-wrap leading-relaxed">
                      {snapshots.initialGoal.summary}
                    </p>
                    <p className="text-[9px] text-blue-500 mt-1">
                      関連ノード {snapshots.initialGoal.nodeIds.length}件
                    </p>
                  </div>
                )}

                {/* 着地点 */}
                {snapshots.finalLanding ? (
                  <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-2 h-2 rounded-full bg-purple-400" />
                      <span className="text-[10px] font-semibold text-purple-600">着地点（タスク完了時）</span>
                      <span className="text-[9px] text-slate-400 ml-auto">
                        {new Date(snapshots.finalLanding.createdAt).toLocaleDateString('ja-JP')}
                      </span>
                    </div>
                    <p className="text-xs text-purple-800 whitespace-pre-wrap leading-relaxed">
                      {snapshots.finalLanding.summary}
                    </p>
                    <p className="text-[9px] text-purple-500 mt-1">
                      関連ノード {snapshots.finalLanding.nodeIds.length}件
                    </p>
                  </div>
                ) : task.status !== 'done' ? (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 border-dashed">
                    <p className="text-[10px] text-slate-400 text-center">タスク完了時に着地点が記録されます</p>
                  </div>
                ) : null}

                {/* ノード差分 */}
                {snapshots.initialGoal && snapshots.finalLanding && (
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="text-[10px] text-slate-500">
                      {(() => {
                        const initial = new Set(snapshots.initialGoal!.nodeIds);
                        const final_ = new Set(snapshots.finalLanding!.nodeIds);
                        const added = [...final_].filter(id => !initial.has(id)).length;
                        const removed = [...initial].filter(id => !final_.has(id)).length;
                        const kept = [...initial].filter(id => final_.has(id)).length;
                        return (
                          <span className="flex items-center gap-3 justify-center">
                            <span>継続 {kept}件</span>
                            <span className="text-green-600">+{added}件</span>
                            <span className="text-slate-400">-{removed}件</span>
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 会話ハイライト */}
          {conversationHighlights.length > 0 && (
            <div>
              <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                会話ハイライト
              </h3>
              <div className="space-y-2">
                {conversationHighlights.map((hl) => {
                  if (!hl) return null;
                  const phaseLabels: Record<string, string> = {
                    ideation: '💡 構想', progress: '🔧 進行', result: '📊 結果',
                  };
                  const phaseColors: Record<string, string> = {
                    ideation: 'border-amber-200 bg-amber-50',
                    progress: 'border-blue-200 bg-blue-50',
                    result: 'border-purple-200 bg-purple-50',
                  };
                  return (
                    <div key={hl.phase} className={cn('p-2.5 rounded-lg border', phaseColors[hl.phase] || 'border-slate-200 bg-slate-50')}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold text-slate-600">
                          {phaseLabels[hl.phase]}
                        </span>
                        <span className="text-[9px] text-slate-400">{hl.count}件</span>
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2">
                        {hl.first.content}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 起点メッセージ */}
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
        </div>
      )}
    </div>
  );
}
