// v4.0: タスク詳細スライドパネル（サポっとさん風レイアウト）
// カンバンのカードクリックで右からスライドイン
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X, Calendar, MessageCircle, FileText, Pause, Play,
  ChevronRight, ExternalLink, Loader2, User, FolderOpen,
  MessageSquare, Bot, Clock,
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

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/detail`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setTask(data.data);
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
                {/* タスク名 */}
                <h2 className="text-lg font-bold text-nm-text leading-snug mb-5">
                  {task.title}
                </h2>

                {/* === 基本情報テーブル（サポっとさん風） === */}
                <div className="space-y-3 mb-6">
                  {/* 期限 */}
                  <div className="flex items-center">
                    <span className="w-20 text-xs text-slate-400 shrink-0">期限</span>
                    <span className="text-sm text-nm-text">
                      {task.due_date
                        ? new Date(task.due_date).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })
                        : '未設定'}
                    </span>
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
