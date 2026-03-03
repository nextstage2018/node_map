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
import TaskAiChat from './TaskAiChat';

const CATEGORY_LABEL: Record<string, { label: string; color: string }> = {
  routine: { label: '定型', color: 'text-emerald-600 bg-emerald-50' },
  team: { label: 'チーム', color: 'text-violet-600 bg-violet-50' },
  individual: { label: '個別', color: 'text-slate-500 bg-slate-50' },
};

interface TaskDetailProps {
  task: Task | null;
  onUpdate: (id: string, req: UpdateTaskRequest) => Promise<Task | undefined>;
  onRefresh: () => void;
  onDelete?: () => void;
}

interface Snapshot {
  id: string;
  nodeIds: string[];
  summary: string;
  createdAt: string;
}

const PHASE_TIMELINE = [
  { key: 'created', label: '作成', icon: '🌱', color: 'bg-slate-400' },
  { key: 'ideation', label: '構想', icon: '💡', color: 'bg-amber-400' },
  { key: 'progress', label: '進行', icon: '🔧', color: 'bg-blue-400' },
  { key: 'result', label: '結果', icon: '📊', color: 'bg-purple-400' },
  { key: 'completed', label: '完了', icon: '✅', color: 'bg-green-500' },
] as const;

function formatDueDate(dateStr?: string): { label: string; color: string; urgent: boolean } | null {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const label = `${due.getFullYear()}/${due.getMonth() + 1}/${due.getDate()}`;
  if (diff < 0) return { label: `${label}（超過）`, color: 'text-red-600 bg-red-50 border-red-200', urgent: true };
  if (diff === 0) return { label: `${label}（今日）`, color: 'text-amber-600 bg-amber-50 border-amber-200', urgent: true };
  if (diff <= 3) return { label: `${label}（${diff}日後）`, color: 'text-amber-500 bg-amber-50 border-amber-200', urgent: false };
  return { label, color: 'text-slate-500 bg-slate-50 border-slate-200', urgent: false };
}

export default function TaskDetail({ task, onUpdate, onRefresh, onDelete }: TaskDetailProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'info'>('chat');
  const [isEditingDueDate, setIsEditingDueDate] = useState(false);
  const [editDueDate, setEditDueDate] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [snapshots, setSnapshots] = useState<{
    initialGoal: Snapshot | null;
    finalLanding: Snapshot | null;
  }>({ initialGoal: null, finalLanding: null });

  useEffect(() => {
    if (!task?.id) return;
    setSnapshots({ initialGoal: null, finalLanding: null });
    const fetchSnapshots = async () => {
      try {
        const res = await fetch(`/api/nodes/snapshots?taskId=${task.id}`);
        const json = await res.json();
        if (json.success && json.data) setSnapshots(json.data);
      } catch { /* ignore */ }
    };
    fetchSnapshots();
  }, [task?.id]);

  useEffect(() => {
    setIsEditingDueDate(false);
    setEditDueDate(task?.dueDate || '');
    setShowDeleteModal(false);
  }, [task?.id, task?.dueDate]);

  if (!task) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-4xl mb-3 opacity-30">📋</div>
          <p className="text-sm text-slate-400">タスクを選択してください</p>
        </div>
      </div>
    );
  }

  const statusConfig = TASK_STATUS_CONFIG[task.status];
  const priorityConfig = TASK_PRIORITY_CONFIG[task.priority];
  const category = CATEGORY_LABEL[task.taskCategory || 'individual'];
  const dueInfo = formatDueDate(task.dueDate);

  const handleStatusChange = async () => {
    const nextStatus = task.status === 'todo' ? 'in_progress' : 'todo';
    await onUpdate(task.id, { status: nextStatus });
    onRefresh();
  };

  const handleComplete = async () => {
    await onUpdate(task.id, { status: 'done' });
    onRefresh();
    if (onDelete) onDelete();
  };

  const handlePhaseChange = (phase: TaskPhase) => {
    onUpdate(task.id, { phase });
    onRefresh();
  };

  const handleDueDateSave = async () => {
    try {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, dueDate: editDueDate || null }),
      });
      setIsEditingDueDate(false);
      onRefresh();
    } catch { /* error */ }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/tasks?id=${task.id}`, { method: 'DELETE' });
      if (res.ok) {
        setShowDeleteModal(false);
        onRefresh();
        if (onDelete) onDelete();
      }
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setIsDeleting(false);
    }
  };

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
  }).filter(e => e.key === 'created' || e.timestamp);

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
    <div className="flex flex-col h-full min-h-0 bg-white">
      {/* 削除確認モーダル */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900 mb-2">タスクを削除</h3>
            <p className="text-sm text-slate-600 mb-1">
              「<span className="font-semibold">{task.title}</span>」を削除します。
            </p>
            <p className="text-xs text-slate-400 mb-5">
              AI会話や思考ノードも含めて完全に削除されます。この操作は取り消せません。
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isDeleting ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ヘッダー */}
      <div className="px-5 pt-4 pb-3 border-b border-slate-100">
        {/* 上段: プロジェクト + カテゴリ + チャネル */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          {task.projectName && (
            <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
              {task.organizationName ? `${task.organizationName} / ` : ''}{task.projectName}
            </span>
          )}
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md font-medium', category.color)}>
            {category.label}
          </span>
          {task.sourceChannel && (
            <span className="text-[10px] text-slate-400">
              {CHANNEL_CONFIG[task.sourceChannel].label}
            </span>
          )}
          {task.recurrenceType && (
            <span className="text-[10px] text-slate-400">🔄 繰り返し</span>
          )}
          {task.estimatedHours && (
            <span className="text-[10px] text-slate-400">⏱ {task.estimatedHours}h</span>
          )}
        </div>

        {/* タイトル */}
        <h2 className="text-base font-bold text-slate-900 leading-snug mb-1">{task.title}</h2>
        {task.description && (
          <p className="text-xs text-slate-500 line-clamp-2 mb-2">{task.description}</p>
        )}

        {/* ステータス + 優先度 + アクションバー */}
        <div className="flex items-center gap-2 mb-2">
          <span className={cn('text-[11px] px-2 py-0.5 rounded-lg font-semibold', statusConfig.color)}>
            {statusConfig.label}
          </span>
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md font-bold', priorityConfig.badgeColor)}>
            {priorityConfig.label}
          </span>
          <div className="flex-1" />
          <button
            onClick={handleStatusChange}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-lg transition-colors',
              task.status === 'todo'
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            {task.status === 'todo' ? '▶ 開始' : '↩ 未着手に戻す'}
          </button>
          <button
            onClick={handleComplete}
            className="px-3 py-1 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
          >
            ✅ 完了
          </button>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="px-2 py-1 text-xs rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="タスクを削除"
          >
            🗑
          </button>
        </div>

        {/* 期限 + 更新日時 */}
        <div className="flex items-center gap-2">
          {isEditingDueDate ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400">📅</span>
              <input
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
                className="px-2 py-0.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <button onClick={handleDueDateSave} className="text-[10px] text-blue-600 hover:text-blue-800 font-medium">保存</button>
              <button onClick={() => { setIsEditingDueDate(false); setEditDueDate(task.dueDate || ''); }} className="text-[10px] text-slate-400">取消</button>
            </div>
          ) : dueInfo ? (
            <button
              onClick={() => { setIsEditingDueDate(true); setEditDueDate(task.dueDate || ''); }}
              className={cn('text-[11px] px-2 py-0.5 rounded-md border font-medium', dueInfo.color)}
              title="クリックで編集"
            >
              📅 {dueInfo.label}
            </button>
          ) : (
            <button
              onClick={() => { setIsEditingDueDate(true); setEditDueDate(''); }}
              className="text-[10px] text-slate-300 hover:text-slate-500 transition-colors"
            >
              📅 期限を設定
            </button>
          )}
          <span className="text-[10px] text-slate-300 ml-auto">
            更新 {formatRelativeTime(task.updatedAt)}
          </span>
        </div>
      </div>

      {/* タブ */}
      <div className="flex border-b border-slate-100">
        <button
          onClick={() => setActiveTab('chat')}
          className={cn(
            'flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'chat'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          )}
        >
          🤖 AI会話
          {(task.conversations ?? []).length > 0 && (
            <span className="ml-1 text-[10px] text-slate-400">
              ({(task.conversations ?? []).length})
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('info')}
          className={cn(
            'flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
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
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* フェーズタイムライン */}
          <div>
            <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">フェーズ変遷</h3>
            <div className="relative pl-6">
              <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-slate-200" />
              {timelineEvents.map((event) => (
                <div key={event.key} className="relative flex items-start gap-3 pb-4 last:pb-0">
                  <div className={cn(
                    'absolute left-[-15px] w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] border-2 border-white shadow-sm z-10',
                    event.timestamp ? event.color : 'bg-slate-200'
                  )}>
                    <span className="text-[9px]">{event.icon}</span>
                  </div>
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

          {/* スナップショット */}
          {(snapshots.initialGoal || snapshots.finalLanding) && (
            <div>
              <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">出口想定 vs 着地点</h3>
              <div className="space-y-2">
                {snapshots.initialGoal && (
                  <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-2 h-2 rounded-full bg-blue-400" />
                      <span className="text-[10px] font-semibold text-blue-600">出口想定</span>
                      <span className="text-[9px] text-slate-400 ml-auto">
                        {new Date(snapshots.initialGoal.createdAt).toLocaleDateString('ja-JP')}
                      </span>
                    </div>
                    <p className="text-xs text-blue-800 whitespace-pre-wrap leading-relaxed">{snapshots.initialGoal.summary}</p>
                  </div>
                )}
                {snapshots.finalLanding ? (
                  <div className="p-3 bg-purple-50 rounded-xl border border-purple-100">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-2 h-2 rounded-full bg-purple-400" />
                      <span className="text-[10px] font-semibold text-purple-600">着地点</span>
                      <span className="text-[9px] text-slate-400 ml-auto">
                        {new Date(snapshots.finalLanding.createdAt).toLocaleDateString('ja-JP')}
                      </span>
                    </div>
                    <p className="text-xs text-purple-800 whitespace-pre-wrap leading-relaxed">{snapshots.finalLanding.summary}</p>
                  </div>
                ) : task.status !== 'done' ? (
                  <div className="p-3 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <p className="text-[10px] text-slate-400 text-center">タスク完了時に着地点が記録されます</p>
                  </div>
                ) : null}
                {snapshots.initialGoal && snapshots.finalLanding && (
                  <div className="p-2 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <span className="text-[10px] text-slate-500">
                      {(() => {
                        const initial = new Set(snapshots.initialGoal!.nodeIds);
                        const final_ = new Set(snapshots.finalLanding!.nodeIds);
                        const added = [...final_].filter(id => !initial.has(id)).length;
                        const removed = [...initial].filter(id => !final_.has(id)).length;
                        const kept = [...initial].filter(id => final_.has(id)).length;
                        return `継続 ${kept}件 / +${added}件 / -${removed}件`;
                      })()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 会話ハイライト */}
          {conversationHighlights.length > 0 && (
            <div>
              <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">会話ハイライト</h3>
              <div className="space-y-2">
                {conversationHighlights.map((hl) => {
                  if (!hl) return null;
                  const phaseLabels: Record<string, string> = { ideation: '💡 構想', progress: '🔧 進行', result: '📊 結果' };
                  const phaseColors: Record<string, string> = {
                    ideation: 'border-amber-200 bg-amber-50',
                    progress: 'border-blue-200 bg-blue-50',
                    result: 'border-purple-200 bg-purple-50',
                  };
                  return (
                    <div key={hl.phase} className={cn('p-3 rounded-xl border', phaseColors[hl.phase] || 'border-slate-200 bg-slate-50')}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold text-slate-600">{phaseLabels[hl.phase]}</span>
                        <span className="text-[9px] text-slate-400">{hl.count}件</span>
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2">{hl.first.content}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 起点メッセージ */}
          {task.sourceChannel && (
            <div>
              <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">📨 起点メッセージ</h3>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium',
                  CHANNEL_CONFIG[task.sourceChannel].bgColor,
                  CHANNEL_CONFIG[task.sourceChannel].textColor
                )}>
                  {CHANNEL_CONFIG[task.sourceChannel].label}
                </span>
                <span className="text-xs text-slate-400 ml-2">から作成</span>
              </div>
            </div>
          )}

          {/* タグ */}
          {(task.tags ?? []).length > 0 && (
            <div>
              <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">🏷️ タグ</h3>
              <div className="flex flex-wrap gap-1.5">
                {(task.tags ?? []).map((tag) => (
                  <span key={tag} className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">{tag}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
