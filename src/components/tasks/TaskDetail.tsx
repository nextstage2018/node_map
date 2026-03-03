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

const CATEGORY_LABEL: Record<string, { label: string; bg: string; text: string }> = {
  routine: { label: '定型', bg: 'bg-emerald-50', text: 'text-emerald-600' },
  team: { label: 'チーム', bg: 'bg-violet-50', text: 'text-violet-600' },
  individual: { label: '個別', bg: 'bg-slate-50', text: 'text-slate-500' },
};

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

function formatDueDate(dateStr?: string): { label: string; color: string; bgColor: string } | null {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const label = `${due.getFullYear()}/${due.getMonth() + 1}/${due.getDate()}`;
  if (diff < 0) return { label: `${label}（超過）`, color: 'text-red-600', bgColor: 'bg-red-50 border-red-200' };
  if (diff === 0) return { label: `${label}（今日）`, color: 'text-amber-600', bgColor: 'bg-amber-50 border-amber-200' };
  if (diff <= 3) return { label: `${label}（${diff}日後）`, color: 'text-amber-500', bgColor: 'bg-amber-50 border-amber-200' };
  return { label, color: 'text-slate-500', bgColor: 'bg-slate-50 border-slate-200' };
}

export default function TaskDetail({ task, onUpdate, onRefresh }: TaskDetailProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'info'>('chat');
  const [isEditingDueDate, setIsEditingDueDate] = useState(false);
  const [editDueDate, setEditDueDate] = useState('');
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

  // 期限編集状態リセット
  useEffect(() => {
    setIsEditingDueDate(false);
    setEditDueDate(task?.dueDate || '');
  }, [task?.id, task?.dueDate]);

  if (!task) {
    return (
      <div className="flex items-center justify-center h-full text-slate-300">
        <div className="text-center">
          <div className="text-5xl mb-4 opacity-40">📋</div>
          <p className="text-sm font-medium">タスクを選択してください</p>
          <p className="text-xs text-slate-300 mt-1">左のカンバンからタスクをクリック</p>
        </div>
      </div>
    );
  }

  const statusConfig = TASK_STATUS_CONFIG[task.status];
  const priorityConfig = TASK_PRIORITY_CONFIG[task.priority];
  const category = CATEGORY_LABEL[task.taskCategory || 'individual'];
  const dueInfo = formatDueDate(task.dueDate);

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
  }).filter(e => e.key === 'created' || e.timestamp);

  // 会話ハイライト
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
      <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/30">
        {/* プロジェクト名 + カテゴリ + チャネル */}
        <div className="flex items-center gap-1.5 mb-2">
          {task.projectName && (
            <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md font-semibold">
              {task.organizationName ? `${task.organizationName} / ` : ''}{task.projectName}
            </span>
          )}
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md font-medium', category.bg, category.text)}>
            {category.label}
          </span>
          {task.sourceChannel && (
            <span className="text-[10px] text-slate-400 ml-auto">
              {CHANNEL_CONFIG[task.sourceChannel].label}
            </span>
          )}
        </div>

        {/* タイトル */}
        <h2 className="text-base font-bold text-slate-900 leading-snug mb-1.5">{task.title}</h2>

        {/* 説明 */}
        {task.description && (
          <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 mb-2">{task.description}</p>
        )}

        {/* ステータス + 優先度 + アクション */}
        <div className="flex items-center gap-2 mb-2">
          <span className={cn('text-[11px] px-2.5 py-1 rounded-lg font-semibold', statusConfig.color)}>
            {statusConfig.label}
          </span>
          <span className={cn('text-[10px] px-2 py-0.5 rounded-md font-bold', priorityConfig.badgeColor)}>
            {priorityConfig.label}
          </span>
          {task.recurrenceType && (
            <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
              🔄 繰り返し
            </span>
          )}
          {task.estimatedHours && (
            <span className="text-[10px] text-slate-400">
              ⏱ {task.estimatedHours}h
            </span>
          )}
          <div className="flex-1" />
          <button
            onClick={handleStatusChange}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors',
              task.status === 'todo'
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : task.status === 'in_progress'
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
            )}
          >
            {task.status === 'todo'
              ? '▶ 開始'
              : task.status === 'in_progress'
              ? '✅ 完了'
              : '↩ 戻す'}
          </button>
        </div>

        {/* 期限 + 日時情報 */}
        <div className="flex items-center gap-3">
          {/* 期限日表示・編集 */}
          {isEditingDueDate ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400">📅</span>
              <input
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
                className="px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <button
                onClick={handleDueDateSave}
                className="text-[10px] text-blue-600 hover:text-blue-800 font-medium"
              >
                保存
              </button>
              <button
                onClick={() => { setIsEditingDueDate(false); setEditDueDate(task.dueDate || ''); }}
                className="text-[10px] text-slate-400 hover:text-slate-600"
              >
                取消
              </button>
            </div>
          ) : dueInfo ? (
            <button
              onClick={() => { setIsEditingDueDate(true); setEditDueDate(task.dueDate || ''); }}
              className={cn('flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border font-medium', dueInfo.bgColor, dueInfo.color)}
              title="クリックで編集"
            >
              📅 {dueInfo.label}
            </button>
          ) : (
            <button
              onClick={() => { setIsEditingDueDate(true); setEditDueDate(''); }}
              className="flex items-center gap-1 text-[10px] text-slate-300 hover:text-slate-500 transition-colors"
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
      <div className="flex border-b border-slate-100 bg-white">
        <button
          onClick={() => setActiveTab('chat')}
          className={cn(
            'flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-all',
            activeTab === 'chat'
              ? 'border-blue-500 text-blue-600 bg-blue-50/30'
              : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50/50'
          )}
        >
          🤖 AI会話
          {(task.conversations ?? []).length > 0 && (
            <span className="ml-1.5 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
              {(task.conversations ?? []).length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('info')}
          className={cn(
            'flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-all',
            activeTab === 'info'
              ? 'border-blue-500 text-blue-600 bg-blue-50/30'
              : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50/50'
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
            <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
              フェーズ変遷
            </h3>
            <div className="relative pl-6">
              {/* 縦線 */}
              <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-slate-200 to-slate-100" />

              {timelineEvents.map((event) => (
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
              <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
                出口想定 vs 着地点
              </h3>
              <div className="space-y-2.5">
                {snapshots.initialGoal && (
                  <div className="p-3.5 bg-gradient-to-br from-blue-50 to-blue-50/30 rounded-xl border border-blue-100">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="w-2 h-2 rounded-full bg-blue-400" />
                      <span className="text-[10px] font-semibold text-blue-600">出口想定（タスク作成時）</span>
                      <span className="text-[9px] text-slate-400 ml-auto">
                        {new Date(snapshots.initialGoal.createdAt).toLocaleDateString('ja-JP')}
                      </span>
                    </div>
                    <p className="text-xs text-blue-800 whitespace-pre-wrap leading-relaxed">
                      {snapshots.initialGoal.summary}
                    </p>
                    <p className="text-[9px] text-blue-500 mt-1.5">
                      関連ノード {snapshots.initialGoal.nodeIds.length}件
                    </p>
                  </div>
                )}

                {snapshots.finalLanding ? (
                  <div className="p-3.5 bg-gradient-to-br from-purple-50 to-purple-50/30 rounded-xl border border-purple-100">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="w-2 h-2 rounded-full bg-purple-400" />
                      <span className="text-[10px] font-semibold text-purple-600">着地点（タスク完了時）</span>
                      <span className="text-[9px] text-slate-400 ml-auto">
                        {new Date(snapshots.finalLanding.createdAt).toLocaleDateString('ja-JP')}
                      </span>
                    </div>
                    <p className="text-xs text-purple-800 whitespace-pre-wrap leading-relaxed">
                      {snapshots.finalLanding.summary}
                    </p>
                    <p className="text-[9px] text-purple-500 mt-1.5">
                      関連ノード {snapshots.finalLanding.nodeIds.length}件
                    </p>
                  </div>
                ) : task.status !== 'done' ? (
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
                    <p className="text-[10px] text-slate-400 text-center">タスク完了時に着地点が記録されます</p>
                  </div>
                ) : null}

                {/* ノード差分 */}
                {snapshots.initialGoal && snapshots.finalLanding && (
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
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
              <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
                会話ハイライト
              </h3>
              <div className="space-y-2">
                {conversationHighlights.map((hl) => {
                  if (!hl) return null;
                  const phaseLabels: Record<string, string> = {
                    ideation: '💡 構想', progress: '🔧 進行', result: '📊 結果',
                  };
                  const phaseColors: Record<string, string> = {
                    ideation: 'border-amber-200 bg-gradient-to-br from-amber-50 to-amber-50/30',
                    progress: 'border-blue-200 bg-gradient-to-br from-blue-50 to-blue-50/30',
                    result: 'border-purple-200 bg-gradient-to-br from-purple-50 to-purple-50/30',
                  };
                  return (
                    <div key={hl.phase} className={cn('p-3 rounded-xl border', phaseColors[hl.phase] || 'border-slate-200 bg-slate-50')}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold text-slate-600">
                          {phaseLabels[hl.phase]}
                        </span>
                        <span className="text-[9px] text-slate-400">{hl.count}件</span>
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
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
              <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                📨 起点メッセージ
              </h3>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
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
            <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              🏷️ タグ
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {(task.tags ?? []).length > 0 ? (
                (task.tags ?? []).map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-medium"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-300">タグなし</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
