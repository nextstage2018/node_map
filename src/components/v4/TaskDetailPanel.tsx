// v4.0: タスク詳細スライドパネル
// カンバンのカードクリックで右からスライドイン
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X, Calendar, MessageCircle, FileText, Pause, Play,
  ChevronRight, ExternalLink, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import TaskChatView from './TaskChatView';

interface Conversation {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  phase: string;
  conversation_tag?: string;
  turn_id?: string;
  created_at: string;
}

interface Document {
  id: string;
  title: string;
  document_url?: string;
  document_type?: string;
  created_at: string;
}

interface TaskDetail {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  phase: string;
  task_type: string;
  due_date?: string;
  source_type?: string;
  assigned_contact_id?: string;
  assignee_name?: string;
  project_id?: string;
  project_name?: string;
  milestone_id?: string;
  milestone_title?: string;
  theme_id?: string;
  theme_title?: string;
  result_summary?: string;
  ideation_summary?: string;
  created_at: string;
  updated_at: string;
  conversations: Conversation[];
  documents: Document[];
}

interface TaskDetailPanelProps {
  taskId: string;
  onClose: () => void;
  onStatusChange?: (taskId: string, newStatus: string) => void;
}

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  high: { label: '高', color: 'text-red-600 bg-red-50' },
  medium: { label: '中', color: 'text-amber-600 bg-amber-50' },
  low: { label: '低', color: 'text-slate-500 bg-slate-50' },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  todo: { label: '着手前', color: 'text-slate-600 bg-slate-100' },
  in_progress: { label: '進行中', color: 'text-blue-600 bg-blue-50' },
  done: { label: '完了', color: 'text-green-600 bg-green-50' },
  on_hold: { label: '保留', color: 'text-amber-600 bg-amber-50' },
};

export default function TaskDetailPanel({ taskId, onClose, onStatusChange }: TaskDetailPanelProps) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isSavingDescription, setIsSavingDescription] = useState(false);

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/detail`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setTask(data.data);
          setEditTitle(data.data.title);
          setEditDescription(data.data.description || '');
        }
      }
    } catch (error) {
      console.error('タスク詳細取得エラー:', error);
    } finally {
      setIsLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    setIsLoading(true);
    setShowChat(false);
    fetchDetail();
  }, [fetchDetail]);

  // タイトル保存
  const handleSaveTitle = async () => {
    if (!task || editTitle.trim() === task.title) {
      setIsEditingTitle(false);
      return;
    }
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle.trim() }),
      });
      setTask(prev => prev ? { ...prev, title: editTitle.trim() } : prev);
    } catch (error) {
      console.error('タイトル更新エラー:', error);
    }
    setIsEditingTitle(false);
  };

  // メモ保存
  const handleSaveDescription = async () => {
    if (!task || editDescription === (task.description || '')) return;
    setIsSavingDescription(true);
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: editDescription }),
      });
      setTask(prev => prev ? { ...prev, description: editDescription } : prev);
    } catch (error) {
      console.error('メモ更新エラー:', error);
    } finally {
      setIsSavingDescription(false);
    }
  };

  // 保留切替
  const handleToggleHold = async () => {
    if (!task) return;
    const newStatus = task.status === 'on_hold' ? 'todo' : 'on_hold';
    try {
      await fetch(`/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      setTask(prev => prev ? { ...prev, status: newStatus } : prev);
      onStatusChange?.(taskId, newStatus);
    } catch (error) {
      console.error('ステータス更新エラー:', error);
    }
  };

  // パンくず生成
  const breadcrumbs: string[] = [];
  if (task?.project_name) breadcrumbs.push(task.project_name);
  if (task?.theme_title) breadcrumbs.push(task.theme_title);
  if (task?.milestone_title) breadcrumbs.push(task.milestone_title);

  return (
    <>
      {/* 背景オーバーレイ */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* パネル */}
      <div className="fixed right-0 top-0 h-full w-full max-w-[480px] bg-white shadow-2xl z-50 flex flex-col animate-slide-in-right">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
          </div>
        ) : !task ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
            タスクが見つかりません
          </div>
        ) : showChat ? (
          /* AI会話モード */
          <TaskChatView
            taskId={taskId}
            conversations={task.conversations}
            taskStatus={task.status}
            onBack={() => setShowChat(false)}
            onConversationUpdate={fetchDetail}
          />
        ) : (
          /* 詳細モード */
          <>
            {/* ヘッダー */}
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2 min-w-0">
                {breadcrumbs.length > 0 && (
                  <span className="text-[10px] text-nm-text-secondary truncate">
                    {breadcrumbs.join(' > ')}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {/* コンテンツ */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-5 py-4 space-y-5">
                {/* タスク名 */}
                <div>
                  {isEditingTitle ? (
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={handleSaveTitle}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                      className="w-full text-lg font-semibold text-nm-text border-b-2 border-blue-400 focus:outline-none pb-1"
                      autoFocus
                    />
                  ) : (
                    <h2
                      onClick={() => setIsEditingTitle(true)}
                      className="text-lg font-semibold text-nm-text cursor-text hover:bg-slate-50 rounded px-1 -mx-1 py-0.5"
                    >
                      {task.title}
                    </h2>
                  )}
                </div>

                {/* ステータス・優先度バッジ */}
                <div className="flex items-center gap-2 flex-wrap">
                  {STATUS_LABELS[task.status] && (
                    <span className={cn(
                      'text-xs font-medium px-2.5 py-1 rounded-full',
                      STATUS_LABELS[task.status].color
                    )}>
                      {STATUS_LABELS[task.status].label}
                    </span>
                  )}
                  {PRIORITY_LABELS[task.priority] && (
                    <span className={cn(
                      'text-xs font-medium px-2.5 py-1 rounded-full',
                      PRIORITY_LABELS[task.priority].color
                    )}>
                      優先度: {PRIORITY_LABELS[task.priority].label}
                    </span>
                  )}
                  {task.assignee_name && (
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full text-blue-600 bg-blue-50">
                      {task.assignee_name}
                    </span>
                  )}
                </div>

                {/* 期日 */}
                {task.due_date && (
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span>期日: {new Date(task.due_date).toLocaleDateString('ja-JP')}</span>
                  </div>
                )}

                {/* メモ */}
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">メモ</label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    onBlur={handleSaveDescription}
                    placeholder="メモを追加..."
                    rows={3}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 resize-none"
                  />
                  {isSavingDescription && (
                    <span className="text-[10px] text-slate-400">保存中...</span>
                  )}
                </div>

                {/* AIに相談ボタン */}
                <button
                  onClick={() => setShowChat(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  <MessageCircle className="w-4 h-4" />
                  AIに相談
                  {task.conversations.length > 0 && (
                    <span className="text-[10px] bg-blue-500 px-1.5 py-0.5 rounded-full">
                      {task.conversations.filter(c => c.role === 'user').length}回の相談履歴
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 ml-auto" />
                </button>

                {/* 過去の会話サマリー（あれば） */}
                {task.conversations.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-2 block">
                      過去のAI相談（{task.conversations.filter(c => c.role === 'user').length}回）
                    </label>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {task.conversations
                        .filter(c => c.role === 'user')
                        .slice(-3)
                        .map((conv) => (
                          <div
                            key={conv.id}
                            onClick={() => setShowChat(true)}
                            className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 cursor-pointer hover:bg-slate-100 transition-colors"
                          >
                            <span className="text-[10px] text-slate-400">
                              {new Date(conv.created_at).toLocaleDateString('ja-JP')}
                            </span>
                            <p className="line-clamp-2 mt-0.5">{conv.content}</p>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* 関連資料 */}
                {task.documents.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-2 block">
                      関連資料（{task.documents.length}件）
                    </label>
                    <div className="space-y-1.5">
                      {task.documents.map(doc => (
                        <a
                          key={doc.id}
                          href={doc.document_url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-700 bg-blue-50 rounded-lg px-3 py-2 transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{doc.title}</span>
                          <ExternalLink className="w-3 h-3 shrink-0 ml-auto" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* 保留ボタン */}
                {task.status !== 'done' && (
                  <button
                    onClick={handleToggleHold}
                    className={cn(
                      'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors border',
                      task.status === 'on_hold'
                        ? 'border-blue-200 text-blue-600 hover:bg-blue-50'
                        : 'border-amber-200 text-amber-600 hover:bg-amber-50'
                    )}
                  >
                    {task.status === 'on_hold' ? (
                      <>
                        <Play className="w-4 h-4" />
                        保留を解除
                      </>
                    ) : (
                      <>
                        <Pause className="w-4 h-4" />
                        保留にする
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.2s ease-out;
        }
      `}</style>
    </>
  );
}
