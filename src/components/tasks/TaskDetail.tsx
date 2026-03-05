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
import TaskFileUploadPanel, { TaskFileInfo } from './TaskFileUploadPanel';
import ExternalResourcePanel, { ExternalResource } from './ExternalResourcePanel';

interface AttachedFile {
  id: string;
  file_name: string;
  drive_url: string;
  document_type: string;
  created_at: string;
}

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

/** フェーズプログレスバー用 */
const PHASE_STEPS = [
  { key: 'ideation', label: '構想', color: 'bg-blue-500', textColor: 'text-blue-600' },
  { key: 'progress', label: '進行', color: 'bg-amber-500', textColor: 'text-amber-600' },
  { key: 'result', label: '結果', color: 'bg-green-500', textColor: 'text-green-600' },
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
  return { label, color: 'text-nm-text-light bg-slate-50 border-nm-border', urgent: false };
}

export default function TaskDetail({ task, onUpdate, onRefresh, onDelete }: TaskDetailProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'info'>('chat');
  const [isEditingDueDate, setIsEditingDueDate] = useState(false);
  const [editDueDate, setEditDueDate] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  // Phase 56c: 修正提案
  const [showNegotiationModal, setShowNegotiationModal] = useState(false);
  const [negoChangeType, setNegoChangeType] = useState('deadline');
  const [negoRequesterName, setNegoRequesterName] = useState('');
  const [negoProposedValue, setNegoProposedValue] = useState('');
  const [negoReason, setNegoReason] = useState('');
  const [isSubmittingNego, setIsSubmittingNego] = useState(false);
  const [negotiationCount, setNegotiationCount] = useState(0);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [adjustment, setAdjustment] = useState<Record<string, unknown> | null>(null);
  const [isLoadingAdjustment, setIsLoadingAdjustment] = useState(false);
  const [isApplyingAdjustment, setIsApplyingAdjustment] = useState(false);
  const [snapshots, setSnapshots] = useState<{
    initialGoal: Snapshot | null;
    finalLanding: Snapshot | null;
  }>({ initialGoal: null, finalLanding: null });
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [showFileUpload, setShowFileUpload] = useState(false);
  // Phase E: 外部資料
  const [externalResources, setExternalResources] = useState<ExternalResource[]>([]);
  const [showExternalResourcePanel, setShowExternalResourcePanel] = useState(false);
  // アコーディオン制御
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [isResourcesOpen, setIsResourcesOpen] = useState(false);

  // Phase 51a: 関連ビジネスイベント
  const [relatedEvents, setRelatedEvents] = useState<{ id: string; title: string; event_type: string; event_date: string }[]>([]);

  // Phase 56c: 修正提案数を取得
  useEffect(() => {
    if (!task?.id || task.status !== 'proposed') { setNegotiationCount(0); return; }
    fetch(`/api/tasks/${task.id}/negotiations`)
      .then(r => r.json())
      .then(d => { if (d.success) setNegotiationCount(d.data?.pendingCount || 0); })
      .catch(() => {});
  }, [task?.id, task?.status]);

  useEffect(() => {
    if (!task?.id) { setRelatedEvents([]); return; }
    fetch(`/api/tasks/${task.id}/business-events`)
      .then(r => r.json())
      .then(d => { if (d.success) setRelatedEvents(d.data || []); })
      .catch(() => {});
  }, [task?.id]);

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

  // Phase 50: タスクのファイル一覧を取得
  useEffect(() => {
    if (!task?.id) { setAttachedFiles([]); return; }
    setShowFileUpload(false);
    fetch(`/api/tasks/${task.id}/files`)
      .then(r => r.json())
      .then(d => { if (d.success) setAttachedFiles(d.data || []); })
      .catch(() => {});
  }, [task?.id]);

  // Phase E: 外部資料一覧を取得
  useEffect(() => {
    if (!task?.id) { setExternalResources([]); return; }
    setShowExternalResourcePanel(false);
    fetch(`/api/tasks/${task.id}/external-resources`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setExternalResources((d.data || []).map((r: any) => ({
            id: r.id,
            taskId: r.task_id,
            resourceType: r.resource_type,
            title: r.title,
            contentLength: r.content_length,
            sourceUrl: r.source_url,
            fileName: r.file_name,
            fileMimeType: r.file_mime_type,
            createdAt: r.created_at,
          })));
        }
      })
      .catch(() => {});
  }, [task?.id]);

  useEffect(() => {
    setIsEditingDueDate(false);
    setEditDueDate(task?.dueDate || '');
    setShowDeleteModal(false);
    setIsDocsOpen(false);
    setIsResourcesOpen(false);
  }, [task?.id, task?.dueDate]);

  if (!task) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-4xl mb-3 opacity-30">📋</div>
          <p className="text-sm text-nm-text-light">タスクを選択してください</p>
        </div>
      </div>
    );
  }

  const statusConfig = TASK_STATUS_CONFIG[task.status];
  const priorityConfig = TASK_PRIORITY_CONFIG[task.priority];
  const dueInfo = formatDueDate(task.dueDate);

  // 提案承認: proposed → todo
  const handleApproveProposed = async () => {
    setIsApproving(true);
    try {
      await onUpdate(task.id, { status: 'todo' });
      onRefresh();
    } finally { setIsApproving(false); }
  };

  // 提案却下: タスク削除
  const handleRejectProposed = async () => {
    setIsApproving(true);
    try {
      const res = await fetch(`/api/tasks?id=${task.id}`, { method: 'DELETE' });
      if (res.ok) {
        onRefresh();
        if (onDelete) onDelete();
      }
    } finally { setIsApproving(false); }
  };

  // Phase 56c: 修正リクエスト送信
  const handleSubmitNegotiation = async () => {
    if (!task || !negoRequesterName.trim() || !negoProposedValue.trim()) return;
    setIsSubmittingNego(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/negotiations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterName: negoRequesterName.trim(),
          changeType: negoChangeType,
          proposedValue: negoProposedValue.trim(),
          reason: negoReason.trim() || undefined,
        }),
      });
      if (res.ok) {
        setShowNegotiationModal(false);
        setNegoRequesterName('');
        setNegoProposedValue('');
        setNegoReason('');
        setNegotiationCount(prev => prev + 1);
      }
    } catch { /* error */ }
    finally { setIsSubmittingNego(false); }
  };

  // Phase 56c: AI調整案を生成
  const handleGenerateAdjustment = async () => {
    if (!task) return;
    setIsLoadingAdjustment(true);
    setShowAdjustment(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/negotiations/adjust`, { method: 'POST' });
      const data = await res.json();
      if (data.success) setAdjustment(data.data);
    } catch { /* error */ }
    finally { setIsLoadingAdjustment(false); }
  };

  // Phase 56c: 調整案を承認して反映
  const handleApplyAdjustment = async () => {
    if (!task || !adjustment) return;
    setIsApplyingAdjustment(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/negotiations/adjust`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adjustment }),
      });
      if (res.ok) {
        setShowAdjustment(false);
        setAdjustment(null);
        setNegotiationCount(0);
        onRefresh();
      }
    } catch { /* error */ }
    finally { setIsApplyingAdjustment(false); }
  };

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

  // Phase 50: ファイルアップロード完了
  const handleFileUploadComplete = (file: TaskFileInfo) => {
    setAttachedFiles(prev => [{
      id: file.docId,
      file_name: file.fileName,
      drive_url: file.driveUrl,
      document_type: file.documentType,
      created_at: new Date().toISOString(),
    }, ...prev]);
    setShowFileUpload(false);
  };

  // Phase E: 外部資料追加
  const handleExternalResourceAdded = (resource: ExternalResource) => {
    setExternalResources(prev => [resource, ...prev]);
    setShowExternalResourcePanel(false);
  };

  // Phase E: 外部資料削除
  const handleRemoveExternalResource = async (resourceId: string) => {
    if (!task) return;
    try {
      await fetch(`/api/tasks/${task.id}/external-resources?resourceId=${resourceId}`, {
        method: 'DELETE',
      });
      setExternalResources(prev => prev.filter(r => r.id !== resourceId));
    } catch { /* ignore */ }
  };

  // Phase 50: ファイルをタスクから切り離し
  const handleRemoveFile = async (fileId: string) => {
    if (!task) return;
    try {
      await fetch(`/api/tasks/${task.id}/files`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
      });
      setAttachedFiles(prev => prev.filter(f => f.id !== fileId));
    } catch { /* ignore */ }
  };

  // フェーズプログレスバーの現在位置
  const currentPhaseIndex = PHASE_STEPS.findIndex(s => s.key === task.phase);

  // 変遷タブ用データ
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
            <h3 className="text-lg font-bold text-nm-text mb-2">タスクを削除</h3>
            <p className="text-sm text-nm-text-light mb-1">
              「<span className="font-semibold">{task.title}</span>」を削除します。
            </p>
            <p className="text-xs text-slate-400 mb-5">
              AI会話や思考ノードも含めて完全に削除されます。この操作は取り消せません。
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm rounded-xl border border-nm-border text-nm-text-light hover:bg-slate-50 disabled:opacity-50 transition-colors"
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
      <div className="px-5 pt-4 pb-3 border-b border-nm-border">
        {/* 上段: プロジェクト名 */}
        {task.projectName && (
          <div className="mb-2">
            <span className="text-[10px] font-semibold text-nm-accent bg-blue-50 px-2 py-0.5 rounded-md">
              {task.organizationName ? `${task.organizationName} / ` : ''}{task.projectName}
            </span>
          </div>
        )}

        {/* タイトル */}
        <h2 className="text-base font-bold text-nm-text leading-snug mb-1">{task.title}</h2>
        {task.description && (
          <p className="text-xs text-nm-text-light line-clamp-2 mb-2">{task.description}</p>
        )}

        {/* フェーズプログレスバー */}
        <div className="flex items-center gap-1 mb-3">
          {PHASE_STEPS.map((step, i) => {
            const isActive = i === currentPhaseIndex;
            const isPast = i < currentPhaseIndex;
            return (
              <div key={step.key} className="flex items-center gap-1 flex-1">
                {/* ドット */}
                <button
                  onClick={() => handlePhaseChange(step.key as TaskPhase)}
                  className={cn(
                    'w-3 h-3 rounded-full shrink-0 transition-all border-2',
                    isActive
                      ? `${step.color} border-white ring-2 ring-offset-1 ring-current`
                      : isPast
                        ? `${step.color} border-white`
                        : 'bg-slate-200 border-white'
                  )}
                  title={`${step.label}フェーズに変更`}
                />
                {/* ラベル */}
                <span className={cn(
                  'text-[10px] font-medium whitespace-nowrap',
                  isActive ? step.textColor : isPast ? 'text-nm-text-light' : 'text-slate-300'
                )}>
                  {step.label}
                </span>
                {/* ライン */}
                {i < PHASE_STEPS.length - 1 && (
                  <div className={cn(
                    'flex-1 h-0.5 rounded-full',
                    isPast ? step.color : 'bg-slate-200'
                  )} />
                )}
              </div>
            );
          })}
        </div>

        {/* ステータス + 優先度 + アクションバー */}
        <div className="flex items-center gap-2 mb-2">
          <span className={cn('text-[11px] px-2 py-0.5 rounded-lg font-semibold', statusConfig.color)}>
            {statusConfig.label}
          </span>
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md font-bold', priorityConfig.badgeColor)}>
            {priorityConfig.label}
          </span>
          <div className="flex-1" />
          {task.status === 'proposed' ? (
            <>
              <button
                onClick={handleApproveProposed}
                disabled={isApproving}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                承認
              </button>
              <button
                onClick={handleRejectProposed}
                disabled={isApproving}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-50"
              >
                却下
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleStatusChange}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-lg transition-colors',
                  task.status === 'todo'
                    ? 'bg-nm-accent text-white hover:bg-blue-700'
                    : 'bg-slate-100 text-nm-text-light hover:bg-slate-200'
                )}
              >
                {task.status === 'todo' ? '開始' : '未着手に戻す'}
              </button>
              <button
                onClick={handleComplete}
                className="px-3 py-1 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
              >
                完了
              </button>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="px-2 py-1 text-xs rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="タスクを削除"
              >
                🗑
              </button>
            </>
          )}
        </div>

        {/* 提案中バナー */}
        {task.status === 'proposed' && (
          <div className="p-2.5 mb-2 rounded-lg bg-amber-50 border border-amber-200">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-amber-700 font-medium">
                AIが提案したタスクです。承認すると「未着手」に移動します。
              </p>
              <button
                onClick={() => setShowNegotiationModal(true)}
                className="shrink-0 ml-2 px-2.5 py-1 text-[10px] font-semibold rounded-md bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300 transition-colors"
              >
                修正提案
                {negotiationCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-amber-600 text-white rounded-full text-[9px]">
                    {negotiationCount}
                  </span>
                )}
              </button>
            </div>
            {/* 調整待ち表示 */}
            {negotiationCount > 0 && !showAdjustment && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] text-amber-600">{negotiationCount}件の修正希望あり</span>
                <button
                  onClick={handleGenerateAdjustment}
                  className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 font-medium transition-colors"
                >
                  AI調整案を見る
                </button>
              </div>
            )}
            {/* AI調整案表示 */}
            {showAdjustment && (
              <div className="mt-2 p-2 rounded-md bg-white border border-amber-200">
                {isLoadingAdjustment ? (
                  <p className="text-[11px] text-slate-400 text-center py-2">AI分析中...</p>
                ) : adjustment ? (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-nm-text-light">AI調整案</p>
                    {(adjustment as Record<string, unknown>).adjustedDeadline && (
                      <p className="text-[11px] text-nm-text-light">納期: <span className="font-medium">{(adjustment as Record<string, unknown>).adjustedDeadline as string}</span></p>
                    )}
                    {(adjustment as Record<string, unknown>).adjustedPriority && (
                      <p className="text-[11px] text-nm-text-light">優先度: <span className="font-medium">{(adjustment as Record<string, unknown>).adjustedPriority as string}</span></p>
                    )}
                    {(adjustment as Record<string, unknown>).adjustedDescription && (
                      <p className="text-[11px] text-nm-text-light">内容: <span className="font-medium line-clamp-2">{(adjustment as Record<string, unknown>).adjustedDescription as string}</span></p>
                    )}
                    {(adjustment as Record<string, unknown>).adjustedAssigneeName && (
                      <p className="text-[11px] text-nm-text-light">担当: <span className="font-medium">{(adjustment as Record<string, unknown>).adjustedAssigneeName as string}</span></p>
                    )}
                    <p className="text-[10px] text-nm-text-light mt-1">{(adjustment as Record<string, unknown>).reasoning as string}</p>
                    <div className="flex gap-1.5 mt-2">
                      <button
                        onClick={handleApplyAdjustment}
                        disabled={isApplyingAdjustment}
                        className="flex-1 py-1.5 text-[11px] font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                      >
                        {isApplyingAdjustment ? '反映中...' : '承認して反映'}
                      </button>
                      <button
                        onClick={() => { setShowAdjustment(false); setAdjustment(null); }}
                        className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-slate-100 text-nm-text-light hover:bg-slate-200 transition-colors"
                      >
                        閉じる
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 text-center py-2">調整案を生成できませんでした</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* 修正提案モーダル */}
        {showNegotiationModal && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-5 max-w-sm mx-4 shadow-xl w-full">
              <h3 className="text-base font-bold text-nm-text mb-3">修正提案</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-semibold text-nm-text-light block mb-1">提案者（誰からの希望か）</label>
                  <input
                    type="text"
                    value={negoRequesterName}
                    onChange={(e) => setNegoRequesterName(e.target.value)}
                    placeholder="例: 田中さん"
                    className="w-full px-3 py-2 text-sm border border-nm-border rounded-lg focus:outline-none focus:ring-2 focus:ring-nm-accent"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-nm-text-light block mb-1">変更の種類</label>
                  <select
                    value={negoChangeType}
                    onChange={(e) => setNegoChangeType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-nm-border rounded-lg focus:outline-none focus:ring-2 focus:ring-nm-accent"
                  >
                    <option value="deadline">納期変更</option>
                    <option value="priority">優先度変更</option>
                    <option value="content">内容変更</option>
                    <option value="reassign">担当者変更</option>
                    <option value="other">その他</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-nm-text-light block mb-1">希望する変更内容</label>
                  <input
                    type="text"
                    value={negoProposedValue}
                    onChange={(e) => setNegoProposedValue(e.target.value)}
                    placeholder={negoChangeType === 'deadline' ? '例: 2026-03-15' : negoChangeType === 'priority' ? '例: low' : '変更内容を入力'}
                    className="w-full px-3 py-2 text-sm border border-nm-border rounded-lg focus:outline-none focus:ring-2 focus:ring-nm-accent"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-nm-text-light block mb-1">理由（任意）</label>
                  <textarea
                    value={negoReason}
                    onChange={(e) => setNegoReason(e.target.value)}
                    rows={2}
                    placeholder="変更の理由があれば"
                    className="w-full px-3 py-2 text-sm border border-nm-border rounded-lg focus:outline-none focus:ring-2 focus:ring-nm-accent resize-none"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-4 justify-end">
                <button
                  onClick={() => setShowNegotiationModal(false)}
                  className="px-4 py-2 text-sm rounded-xl border border-nm-border text-nm-text-light hover:bg-slate-50 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSubmitNegotiation}
                  disabled={!negoRequesterName.trim() || !negoProposedValue.trim() || isSubmittingNego}
                  className="px-4 py-2 text-sm font-semibold rounded-xl bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  {isSubmittingNego ? '送信中...' : '提案を送信'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 期限 + 更新日時 */}
        <div className="flex items-center gap-2">
          {isEditingDueDate ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-nm-text-light">📅</span>
              <input
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
                className="px-2 py-0.5 text-xs border border-nm-border rounded-lg focus:outline-none focus:ring-1 focus:ring-nm-accent"
              />
              <button onClick={handleDueDateSave} className="text-[10px] text-nm-accent hover:text-blue-800 font-medium">保存</button>
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
              className="text-[10px] text-slate-300 hover:text-nm-text-light transition-colors"
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
      <div className="flex border-b border-nm-border">
        <button
          onClick={() => setActiveTab('chat')}
          className={cn(
            'flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'chat'
              ? 'border-nm-accent text-nm-accent'
              : 'border-transparent text-nm-text-light hover:text-nm-text'
          )}
        >
          AI会話
          {(task.conversations ?? []).length > 0 && (
            <span className="ml-1 text-[10px] text-nm-text-light">
              ({(task.conversations ?? []).length})
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('info')}
          className={cn(
            'flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'info'
              ? 'border-nm-accent text-nm-accent'
              : 'border-transparent text-nm-text-light hover:text-nm-text'
          )}
        >
          変遷
        </button>
      </div>

      {/* ドキュメント＆外部資料 アコーディオン（チャットタブ時のみ） */}
      {activeTab === 'chat' && (
        <div className="shrink-0 border-b border-nm-border">
          {/* ドキュメント アコーディオン */}
          <button
            onClick={() => setIsDocsOpen(!isDocsOpen)}
            className="w-full px-4 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <span className="text-[11px] font-semibold text-nm-text-light">
              📎 ドキュメント{attachedFiles.length > 0 && ` (${attachedFiles.length})`}
            </span>
            <span className={cn('text-[10px] text-nm-text-light transition-transform', isDocsOpen && 'rotate-180')}>
              ▼
            </span>
          </button>
          {isDocsOpen && (
            <div className="px-4 pb-2">
              {task.projectId && (
                <button
                  onClick={() => setShowFileUpload(!showFileUpload)}
                  className="text-[10px] px-2 py-0.5 mb-1.5 text-nm-accent hover:bg-blue-50 rounded-md transition-colors"
                >
                  {showFileUpload ? '閉じる' : '+ 追加'}
                </button>
              )}
              {showFileUpload && task.projectId && (
                <TaskFileUploadPanel
                  taskId={task.id}
                  projectId={task.projectId}
                  onUploadComplete={handleFileUploadComplete}
                  onClose={() => setShowFileUpload(false)}
                />
              )}
              {attachedFiles.length > 0 ? (
                <div className="space-y-1">
                  {attachedFiles.map(file => (
                    <div key={file.id} className="flex items-center gap-2 p-1.5 bg-slate-50 rounded-lg border border-nm-border text-xs group">
                      <a
                        href={file.drive_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-nm-accent hover:underline truncate min-w-0"
                      >
                        📄 {file.file_name}
                      </a>
                      <span className="text-[9px] text-nm-text-light shrink-0">{file.document_type}</span>
                      <button
                        onClick={() => handleRemoveFile(file.id)}
                        className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                        title="タスクから切り離す"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : !task.projectId ? (
                <p className="text-[10px] text-slate-300">プロジェクトを設定するとファイルを添付できます</p>
              ) : null}
            </div>
          )}

          {/* 外部資料 アコーディオン */}
          <button
            onClick={() => setIsResourcesOpen(!isResourcesOpen)}
            className="w-full px-4 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors border-t border-slate-100"
          >
            <span className="text-[11px] font-semibold text-nm-text-light">
              📚 外部資料{externalResources.length > 0 && ` (${externalResources.length})`}
            </span>
            <span className={cn('text-[10px] text-nm-text-light transition-transform', isResourcesOpen && 'rotate-180')}>
              ▼
            </span>
          </button>
          {isResourcesOpen && (
            <div className="px-4 pb-2">
              <button
                onClick={() => setShowExternalResourcePanel(!showExternalResourcePanel)}
                className="text-[10px] px-2 py-0.5 mb-1.5 text-nm-accent hover:bg-blue-50 rounded-md transition-colors"
              >
                {showExternalResourcePanel ? '閉じる' : '+ 取り込み'}
              </button>
              {showExternalResourcePanel && (
                <ExternalResourcePanel
                  taskId={task.id}
                  onResourceAdded={handleExternalResourceAdded}
                  onClose={() => setShowExternalResourcePanel(false)}
                />
              )}
              {externalResources.length > 0 ? (
                <div className="space-y-1">
                  {externalResources.map(res => (
                    <div key={res.id} className="flex items-center gap-2 p-1.5 bg-slate-50 rounded-lg border border-nm-border text-xs group">
                      <span className="shrink-0 text-[10px]">
                        {res.resourceType === 'text' ? '📝' : res.resourceType === 'file' ? '📄' : '🔗'}
                      </span>
                      <span className="flex-1 text-nm-text truncate min-w-0">
                        {res.title}
                      </span>
                      <span className="text-[9px] text-nm-text-light shrink-0">
                        {res.contentLength ? `${(res.contentLength / 1000).toFixed(1)}K文字` : ''}
                      </span>
                      <button
                        onClick={() => handleRemoveExternalResource(res.id)}
                        className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                        title="外部資料を削除"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-slate-300">外部AI成果物を取り込んで壁打ちに活用できます</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* 関連ビジネスイベント */}
      {relatedEvents.length > 0 && (
        <div className="border-b border-nm-border bg-slate-50">
          <div className="px-4 py-2">
            <h3 className="text-[10px] font-semibold text-nm-text-light uppercase tracking-wider mb-1">
              ビジネスログ ({relatedEvents.length})
            </h3>
            <div className="space-y-1">
              {relatedEvents.slice(0, 3).map(ev => (
                <a key={ev.id} href="/business-log" className="flex items-center gap-2 text-xs text-nm-text-light hover:text-nm-accent">
                  <span className="text-[10px] text-slate-400">{ev.event_date ? new Date(ev.event_date).toLocaleDateString('ja-JP') : ''}</span>
                  <span className="truncate">{ev.title}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 子タスク一覧 */}
      {task.childTasks && task.childTasks.length > 0 && (
        <div className="border-b border-nm-border bg-slate-50">
          <div className="px-4 py-2">
            <h3 className="text-[10px] font-semibold text-nm-text-light uppercase tracking-wider mb-1.5">
              子タスク ({task.childTasks.filter(c => c.status === 'done').length}/{task.childTasks.length} 完了)
            </h3>
            <div className="space-y-1">
              {task.childTasks.map(child => (
                <div key={child.id} className="flex items-center gap-2 p-1.5 bg-white rounded-lg border border-nm-border text-xs">
                  <span className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    child.status === 'done' ? 'bg-green-400' : child.status === 'in_progress' ? 'bg-blue-400' : child.status === 'proposed' ? 'bg-amber-400' : 'bg-slate-300'
                  )} />
                  <span className={cn(
                    'truncate flex-1',
                    child.status === 'done' ? 'text-slate-400 line-through' : 'text-nm-text'
                  )}>
                    {child.title}
                  </span>
                  <span className={cn(
                    'text-[10px] px-1 py-0.5 rounded shrink-0',
                    child.priority === 'high' ? 'bg-red-50 text-red-600' :
                    child.priority === 'low' ? 'bg-green-50 text-green-600' :
                    'bg-yellow-50 text-yellow-600'
                  )}>
                    {child.priority === 'high' ? '高' : child.priority === 'low' ? '低' : '中'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* コンテンツ */}
      {activeTab === 'chat' ? (
        <TaskAiChat
          task={task}
          onPhaseChange={handlePhaseChange}
          onTaskUpdate={onRefresh}
        />
      ) : (
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* スナップショット */}
          {(snapshots.initialGoal || snapshots.finalLanding) && (
            <div>
              <h3 className="text-[10px] font-semibold text-nm-text-light uppercase tracking-wider mb-3">出口想定 vs 着地点</h3>
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
                  <div className="p-3 bg-slate-50 rounded-xl border border-dashed border-nm-border">
                    <p className="text-[10px] text-slate-400 text-center">タスク完了時に着地点が記録されます</p>
                  </div>
                ) : null}
                {snapshots.initialGoal && snapshots.finalLanding && (
                  <div className="p-2 bg-slate-50 rounded-xl border border-nm-border text-center">
                    <span className="text-[10px] text-nm-text-light">
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
              <h3 className="text-[10px] font-semibold text-nm-text-light uppercase tracking-wider mb-3">会話ハイライト</h3>
              <div className="space-y-2">
                {conversationHighlights.map((hl) => {
                  if (!hl) return null;
                  const phaseLabels: Record<string, string> = { ideation: '構想', progress: '進行', result: '結果' };
                  const phaseColors: Record<string, string> = {
                    ideation: 'border-blue-200 bg-blue-50',
                    progress: 'border-amber-200 bg-amber-50',
                    result: 'border-green-200 bg-green-50',
                  };
                  return (
                    <div key={hl.phase} className={cn('p-3 rounded-xl border', phaseColors[hl.phase] || 'border-nm-border bg-slate-50')}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold text-nm-text-light">{phaseLabels[hl.phase]}</span>
                        <span className="text-[9px] text-slate-400">{hl.count}件</span>
                      </div>
                      <p className="text-xs text-nm-text line-clamp-2">{hl.first.content}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 起点メッセージ */}
          {task.sourceChannel && (
            <div>
              <h3 className="text-[10px] font-semibold text-nm-text-light uppercase tracking-wider mb-2">起点メッセージ</h3>
              <div className="p-3 bg-slate-50 rounded-xl border border-nm-border">
                <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium',
                  CHANNEL_CONFIG[task.sourceChannel].bgColor,
                  CHANNEL_CONFIG[task.sourceChannel].textColor
                )}>
                  {CHANNEL_CONFIG[task.sourceChannel].label}
                </span>
                <span className="text-xs text-nm-text-light ml-2">から作成</span>
              </div>
            </div>
          )}

          {/* タグ */}
          {(task.tags ?? []).length > 0 && (
            <div>
              <h3 className="text-[10px] font-semibold text-nm-text-light uppercase tracking-wider mb-2">タグ</h3>
              <div className="flex flex-wrap gap-1.5">
                {(task.tags ?? []).map((tag) => (
                  <span key={tag} className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-nm-text-light">{tag}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
