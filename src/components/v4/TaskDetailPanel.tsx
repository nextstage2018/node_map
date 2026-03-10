// v4.0: タスク詳細スライドパネル（サポっとさん風レイアウト）
// カンバンのカードクリックで右からスライドイン
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, Calendar, MessageCircle, FileText, Pause, Play,
  ChevronRight, ExternalLink, Loader2, User, FolderOpen,
  MessageSquare, Bot, Clock, Pencil, Check,
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

interface SourceInfo {
  type: string;
  label: string;
  detail?: string;
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
  source_info?: SourceInfo;
  assigned_contact_id?: string;
  assignee_name?: string;
  user_id?: string;
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

const STATUS_OPTIONS: Array<{ value: string; label: string; color: string }> = [
  { value: 'todo', label: '着手前', color: 'bg-slate-100 text-slate-600' },
  { value: 'in_progress', label: '進行中', color: 'bg-blue-50 text-blue-600' },
  { value: 'on_hold', label: '保留', color: 'bg-amber-50 text-amber-600' },
  { value: 'done', label: '完了', color: 'bg-green-50 text-green-600' },
];

function getSourceIcon(sourceType?: string) {
  if (sourceType === 'slack' || sourceType === 'chatwork') {
    return <Bot className="w-3.5 h-3.5 text-indigo-400" />;
  }
  if (sourceType === 'meeting_record') {
    return <MessageSquare className="w-3.5 h-3.5 text-blue-400" />;
  }
  return <User className="w-3.5 h-3.5 text-slate-400" />;
}

export default function TaskDetailPanel({ taskId, onClose, onStatusChange }: TaskDetailPanelProps) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/detail`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setTask(data.data);
          setEditDescription(data.data.description || '');
          setEditTitle(data.data.title || '');
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

  // タイトル保存
  const handleSaveTitle = async () => {
    if (!task || !editTitle.trim() || editTitle === task.title) {
      setIsEditingTitle(false);
      return;
    }
    setIsSavingTitle(true);
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle.trim() }),
      });
      setTask(prev => prev ? { ...prev, title: editTitle.trim() } : prev);
    } catch (error) {
      console.error('タイトル更新エラー:', error);
    } finally {
      setIsSavingTitle(false);
      setIsEditingTitle(false);
    }
  };

  // 期限保存
  const handleSaveDueDate = async (newDate: string) => {
    if (!task) return;
    const value = newDate || null;
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ due_date: value }),
      });
      setTask(prev => prev ? { ...prev, due_date: value || undefined } : prev);
    } catch (error) {
      console.error('期限更新エラー:', error);
    }
  };

  // ステータス変更
  const handleStatusChange = async (newStatus: string) => {
    if (!task || task.status === newStatus) return;
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
          <TaskChatView
            taskId={taskId}
            conversations={task.conversations}
            taskStatus={task.status}
            onBack={() => setShowChat(false)}
            onConversationUpdate={fetchDetail}
          />
        ) : (
          <>
            {/* ヘッダー */}
            <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <div className="flex-1" />
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {/* コンテンツ */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-5 py-4">
                {/* タスク名（編集可能） */}
                {isEditingTitle ? (
                  <div className="flex items-center gap-2 mb-5">
                    <input
                      ref={titleInputRef}
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={handleSaveTitle}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveTitle();
                        if (e.key === 'Escape') { setIsEditingTitle(false); setEditTitle(task.title); }
                      }}
                      autoFocus
                      className="flex-1 text-lg font-bold text-nm-text leading-snug border-b-2 border-blue-400 focus:outline-none bg-transparent"
                    />
                    {isSavingTitle && <Loader2 className="w-4 h-4 text-slate-300 animate-spin" />}
                  </div>
                ) : (
                  <div
                    className="group flex items-start gap-2 mb-5 cursor-pointer"
                    onClick={() => { setIsEditingTitle(true); setEditTitle(task.title); }}
                  >
                    <h2 className="text-lg font-bold text-nm-text leading-snug flex-1">
                      {task.title}
                    </h2>
                    <Pencil className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity mt-1.5 shrink-0" />
                  </div>
                )}

                {/* === 基本情報テーブル（サポっとさん風） === */}
                <div className="space-y-3 mb-6">
                  {/* 期限（編集可能） */}
                  <div className="flex items-center">
                    <span className="w-20 text-xs text-slate-400 shrink-0">期限</span>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="date"
                        value={task.due_date || ''}
                        onChange={(e) => handleSaveDueDate(e.target.value)}
                        className="text-sm text-nm-text bg-transparent border-0 focus:outline-none cursor-pointer hover:text-blue-600 transition-colors"
                      />
                      {task.due_date && (() => {
                        const due = new Date(task.due_date!);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                        if (diff < 0) return <span className="text-[10px] text-red-500 font-medium">{Math.abs(diff)}日超過</span>;
                        if (diff === 0) return <span className="text-[10px] text-amber-500 font-medium">今日</span>;
                        if (diff <= 3) return <span className="text-[10px] text-amber-500 font-medium">{diff}日後</span>;
                        return null;
                      })()}
                    </div>
                  </div>

                  {/* 状況 */}
                  <div className="flex items-center">
                    <span className="w-20 text-xs text-slate-400 shrink-0">状況</span>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={task.status}
                        onChange={(e) => handleStatusChange(e.target.value)}
                        className={cn(
                          'text-xs font-medium px-2.5 py-1 rounded-full border-0 appearance-none cursor-pointer',
                          STATUS_OPTIONS.find(s => s.value === task.status)?.color || 'bg-slate-100 text-slate-600'
                        )}
                      >
                        {STATUS_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* 担当 */}
                  <div className="flex items-center">
                    <span className="w-20 text-xs text-slate-400 shrink-0">担当</span>
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-sm text-nm-text">
                        {task.assignee_name || '自分'}
                      </span>
                    </div>
                  </div>

                  {/* 作成元 */}
                  <div className="flex items-center">
                    <span className="w-20 text-xs text-slate-400 shrink-0">作成元</span>
                    <div className="flex items-center gap-1.5">
                      {getSourceIcon(task.source_type)}
                      <span className="text-sm text-nm-text">
                        {task.source_info?.label || '手動作成'}
                      </span>
                    </div>
                  </div>
                  {task.source_info?.detail && (
                    <div className="flex items-center">
                      <span className="w-20 shrink-0" />
                      <span className="text-xs text-slate-400">{task.source_info.detail}</span>
                    </div>
                  )}

                  {/* プロジェクト */}
                  <div className="flex items-center">
                    <span className="w-20 text-xs text-slate-400 shrink-0">プロジェクト</span>
                    <div className="flex items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-sm text-nm-text">
                        {task.project_name || '未設定'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 区切り線 */}
                <div className="border-t border-slate-100 my-4" />

                {/* === 詳細メモ === */}
                <div className="mb-5">
                  <h3 className="text-sm font-semibold text-nm-text mb-2">詳細</h3>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    onBlur={handleSaveDescription}
                    placeholder="詳細を追加"
                    rows={3}
                    className="w-full text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 resize-none placeholder:text-slate-300"
                  />
                  {isSavingDescription && (
                    <span className="text-[10px] text-slate-400">保存中...</span>
                  )}
                </div>

                {/* 区切り線 */}
                <div className="border-t border-slate-100 my-4" />

                {/* === AI要約 === */}
                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-nm-text">AI要約</h3>
                    {task.conversations.length > 0 && (
                      <span className="text-[10px] text-slate-400">
                        作成: {new Date(task.conversations[0].created_at).toLocaleDateString('ja-JP')}
                      </span>
                    )}
                  </div>

                  {task.conversations.length > 0 ? (
                    <div className="bg-slate-50 rounded-lg px-3 py-2.5 text-sm text-slate-600 space-y-2">
                      {/* 最新のAI応答から要約を表示 */}
                      {task.conversations
                        .filter(c => c.role === 'assistant')
                        .slice(-1)
                        .map(conv => (
                          <p key={conv.id} className="line-clamp-4 leading-relaxed">
                            {conv.content.substring(0, 200)}
                            {conv.content.length > 200 ? '...' : ''}
                          </p>
                        ))}
                      <button
                        onClick={() => setShowChat(true)}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        会話履歴を見る →
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-3">
                      <Clock className="w-3.5 h-3.5" />
                      <span>やりとりが少ないため、要約はまだありません</span>
                    </div>
                  )}
                </div>

                {/* 区切り線 */}
                <div className="border-t border-slate-100 my-4" />

                {/* === 関連資料 === */}
                {task.documents.length > 0 && (
                  <div className="mb-5">
                    <h3 className="text-sm font-semibold text-nm-text mb-2">関連資料</h3>
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
              </div>
            </div>

            {/* フッター: AIに相談ボタン */}
            <div className="shrink-0 border-t border-slate-100 px-5 py-4">
              <button
                onClick={() => setShowChat(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                <MessageCircle className="w-4 h-4" />
                AIに相談
                <ChevronRight className="w-4 h-4 ml-auto" />
              </button>
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
