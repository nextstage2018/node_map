'use client';

import { useState } from 'react';
import {
  FolderOpen, FileText, Phone, Mail, MessageSquare,
  Handshake, X, Pencil, Trash2, AlertTriangle, Bookmark, Bot,
  Sparkles, Loader2, CheckCircle2, Plus, Link2,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { BusinessEvent, EVENT_TYPE_CONFIG, Project, formatDateTime } from './types';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText, Phone, Mail, MessageSquare, Handshake, Bookmark,
};

interface TaskSuggestion {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

interface EventDetailProps {
  event: BusinessEvent;
  project: Project | null;
  onClose: () => void;
  onUpdate: (data: { title: string; content: string; eventType: string }) => Promise<void>;
  onDelete: () => Promise<void>;
}

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  high: { label: '高', color: 'bg-red-100 text-red-700' },
  medium: { label: '中', color: 'bg-yellow-100 text-yellow-700' },
  low: { label: '低', color: 'bg-green-100 text-green-700' },
};

export default function EventDetail({
  event,
  project,
  onClose,
  onUpdate,
  onDelete,
}: EventDetailProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editTitle, setEditTitle] = useState(event.title);
  const [editContent, setEditContent] = useState(event.content || '');
  const [editEventType, setEditEventType] = useState(event.event_type);

  // タスク提案
  const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [createdTasks, setCreatedTasks] = useState<Set<number>>(new Set());
  const [creatingTask, setCreatingTask] = useState<number | null>(null);

  const startEditing = () => {
    setEditTitle(event.title);
    setEditContent(event.content || '');
    setEditEventType(event.event_type);
    setIsEditing(true);
  };

  const handleUpdate = async () => {
    if (!editTitle.trim()) return;
    await onUpdate({ title: editTitle.trim(), content: editContent.trim(), eventType: editEventType });
    setIsEditing(false);
  };

  const handleSuggestTasks = async () => {
    setIsLoadingSuggestions(true);
    setShowSuggestions(true);
    try {
      const res = await fetch(`/api/business-events/${event.id}/suggest-tasks`);
      const data = await res.json();
      if (data.success && data.data?.suggestions) {
        setSuggestions(data.data.suggestions);
      }
    } catch (error) {
      console.error('タスク提案取得エラー:', error);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleCreateTask = async (index: number, suggestion: TaskSuggestion) => {
    setCreatingTask(index);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: suggestion.title,
          description: suggestion.description,
          priority: suggestion.priority,
          projectId: event.project_id || null,
          taskType: 'personal',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCreatedTasks((prev) => new Set([...prev, index]));
      }
    } catch (error) {
      console.error('タスク作成エラー:', error);
    } finally {
      setCreatingTask(null);
    }
  };

  // 会議関連のイベントタイプか判定
  const isMeetingType = ['meeting', 'call', 'calendar_meeting'].includes(event.event_type);

  if (isEditing) {
    return (
      <Card variant="flat" className="w-80 overflow-y-auto bg-slate-50 shrink-0">
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">イベント編集</h3>
            <Button onClick={() => setIsEditing(false)} icon={<X className="w-4 h-4" />} variant="ghost" size="sm" />
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(EVENT_TYPE_CONFIG)
                .filter(([key]) => !['document_received', 'document_submitted', 'summary', 'task_completed', 'calendar_meeting'].includes(key))
                .map(([key, config]) => {
                  const Icon = ICON_MAP[config.icon] || FileText;
                  return (
                    <button
                      key={key}
                      onClick={() => setEditEventType(key)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                        editEventType === key ? 'ring-2 ring-offset-1 ring-blue-400' : ''
                      } ${config.color}`}
                    >
                      <Icon className="w-2.5 h-2.5" />
                      {config.label}
                    </button>
                  );
                })}
            </div>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <div className="flex gap-2">
              <Button onClick={handleUpdate} disabled={!editTitle.trim()} variant="primary" size="sm" className="flex-1">
                保存
              </Button>
              <Button onClick={() => setIsEditing(false)} variant="outline" size="sm">
                取消
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  const typeConfig = EVENT_TYPE_CONFIG[event.event_type] || EVENT_TYPE_CONFIG.note;
  const Icon = ICON_MAP[typeConfig.icon] || FileText;

  return (
    <Card variant="flat" className="w-80 overflow-y-auto bg-slate-50 shrink-0">
      <div className="p-5">
        {/* ヘッダー */}
        <div className="border-b border-slate-200 flex items-start justify-between pb-4 mb-4">
          <h3 className="text-base font-bold text-slate-900 pr-2">{event.title}</h3>
          <div className="flex items-center gap-1 shrink-0">
            {!event.ai_generated && (
              <Button onClick={startEditing} icon={<Pencil className="w-4 h-4" />} variant="ghost" size="sm" title="編集" />
            )}
            <Button onClick={() => setShowDeleteConfirm(true)} icon={<Trash2 className="w-4 h-4" />} variant="ghost" size="sm" title="削除" />
            <Button onClick={onClose} icon={<X className="w-4 h-4" />} variant="ghost" size="sm" />
          </div>
        </div>

        {/* 削除確認 */}
        {showDeleteConfirm && (
          <Card variant="outlined" padding="md" className="mb-4 bg-red-50 border-red-200">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span className="text-xs font-medium text-red-700">このイベントを削除しますか？</span>
            </div>
            <div className="flex gap-2">
              <Button onClick={onDelete} variant="danger" size="sm" className="flex-1">
                削除する
              </Button>
              <Button onClick={() => setShowDeleteConfirm(false)} variant="outline" size="sm">
                取消
              </Button>
            </div>
          </Card>
        )}

        {/* タイプバッジ */}
        <div className="flex items-center gap-2 mb-4">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${typeConfig.color}`}>
            <Icon className="w-3.5 h-3.5" />
            {typeConfig.label}
          </div>
          {event.ai_generated && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-200">
              <Bot className="w-3 h-3" />
              AI自動生成
            </span>
          )}
        </div>

        {/* 日時 */}
        <div className="mb-4">
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">日時</label>
          <p className="text-sm text-slate-700 mt-0.5">{formatDateTime(event.created_at)}</p>
        </div>

        {/* 議事録URL */}
        {(event as Record<string, unknown>).meeting_notes_url && (
          <div className="mb-4">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Link2 className="w-3 h-3" />
              議事録
            </label>
            <a
              href={(event as Record<string, unknown>).meeting_notes_url as string}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline mt-0.5 block truncate"
            >
              {(event as Record<string, unknown>).meeting_notes_url as string}
            </a>
          </div>
        )}

        {/* コンタクト */}
        {event.contact_persons && (
          <div className="mb-4">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">コンタクト</label>
            <p className="text-sm text-slate-700 mt-0.5">
              {event.contact_persons.name}
              {event.contact_persons.company_name && (
                <span className="text-slate-400 ml-1">({event.contact_persons.company_name})</span>
              )}
            </p>
          </div>
        )}

        {/* ソース */}
        {event.source_channel && (
          <div className="mb-4">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">ソース</label>
            <p className="text-sm text-slate-700 mt-0.5">{event.source_channel}</p>
          </div>
        )}

        {/* 内容 */}
        {event.content && (
          <div className="mb-4">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">詳細</label>
            <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap leading-relaxed">{event.content}</p>
          </div>
        )}

        {/* プロジェクト */}
        {event.project_id && project && (
          <div className="mb-4">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">プロジェクト</label>
            <div className="flex items-center gap-2 mt-1">
              <FolderOpen className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-slate-700">{project.name}</span>
            </div>
          </div>
        )}

        {/* タスク提案ボタン（会議タイプのみ） */}
        {isMeetingType && event.content && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            {!showSuggestions ? (
              <Button
                onClick={handleSuggestTasks}
                icon={<Sparkles className="w-4 h-4" />}
                variant="outline"
                size="sm"
                className="w-full"
              >
                AIタスク提案
              </Button>
            ) : (
              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                  <span className="text-xs font-semibold text-slate-700">タスク提案</span>
                </div>
                {isLoadingSuggestions ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400 py-4 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    AI分析中...
                  </div>
                ) : suggestions.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2">提案するタスクが見つかりませんでした</p>
                ) : (
                  <div className="space-y-2">
                    {suggestions.map((s, i) => (
                      <div key={i} className="bg-white rounded-lg border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${PRIORITY_LABELS[s.priority]?.color || ''}`}>
                                {PRIORITY_LABELS[s.priority]?.label || s.priority}
                              </span>
                              <span className="text-xs font-medium text-slate-800 truncate">{s.title}</span>
                            </div>
                            {s.description && (
                              <p className="text-[11px] text-slate-500 line-clamp-2">{s.description}</p>
                            )}
                          </div>
                          {createdTasks.has(i) ? (
                            <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                          ) : (
                            <button
                              onClick={() => handleCreateTask(i, s)}
                              disabled={creatingTask === i}
                              className="shrink-0 p-1 rounded hover:bg-blue-50 text-blue-600 disabled:opacity-50"
                              title="タスク作成"
                            >
                              {creatingTask === i ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Plus className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
