// Phase 56: イベント詳細 + 親子タスク提案UI
'use client';

import { useState, useEffect } from 'react';
import {
  FolderOpen, FileText, Phone, Mail, MessageSquare,
  Handshake, X, Pencil, Trash2, AlertTriangle, Bookmark, Bot,
  Sparkles, Loader2, CheckCircle2, Plus, Link2, Users, ListChecks,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { BusinessEvent, EVENT_TYPE_CONFIG, Project, formatDateTime } from './types';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText, Phone, Mail, MessageSquare, Handshake, Bookmark,
};

interface ChildTaskSuggestion {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  assigneeName?: string;
  assigneeContactId?: string;
}

interface ParentTaskSuggestion {
  title: string;
  description: string;
}

interface EventDetailProps {
  event: BusinessEvent;
  project: Project | null;
  onClose: () => void;
  onUpdate: (data: { title: string; content: string; eventType: string }) => Promise<void>;
  onDelete: () => Promise<void>;
  autoSuggest?: boolean;
  onAutoSuggestDone?: () => void;
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
  autoSuggest,
  onAutoSuggestDone,
}: EventDetailProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editTitle, setEditTitle] = useState(event.title);
  const [editContent, setEditContent] = useState(event.content || '');
  const [editEventType, setEditEventType] = useState(event.event_type);

  // Phase 56: 親子タスク提案
  const [parentTask, setParentTask] = useState<ParentTaskSuggestion | null>(null);
  const [childTasks, setChildTasks] = useState<ChildTaskSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [allCreated, setAllCreated] = useState(false);
  const [isCreatingAll, setIsCreatingAll] = useState(false);
  const [suggestedProjectId, setSuggestedProjectId] = useState<string | null>(null);

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
      if (data.success && data.data) {
        if (data.data.parentTask) {
          setParentTask(data.data.parentTask);
        }
        if (data.data.childTasks && data.data.childTasks.length > 0) {
          setChildTasks(data.data.childTasks);
        }
        if (data.data.projectId) {
          setSuggestedProjectId(data.data.projectId);
        }
      }
    } catch (error) {
      console.error('タスク提案取得エラー:', error);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  // Phase 56: 自動提案トリガー
  useEffect(() => {
    if (autoSuggest && !showSuggestions && !isLoadingSuggestions) {
      handleSuggestTasks();
      onAutoSuggestDone?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSuggest]);

  // Phase 56: 親タスク＋子タスク一括作成
  const handleCreateAllTasks = async () => {
    if (!parentTask || childTasks.length === 0) return;
    setIsCreatingAll(true);
    try {
      const projectId = suggestedProjectId || event.project_id || null;
      const res = await fetch('/api/tasks/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentTask: {
            title: parentTask.title,
            description: parentTask.description,
            projectId,
            taskType: childTasks.some(c => c.assigneeContactId) ? 'group' : 'personal',
          },
          childTasks: childTasks.map((c) => ({
            title: c.title,
            description: c.description,
            priority: c.priority,
            assigneeContactId: c.assigneeContactId || null,
            projectId,
          })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAllCreated(true);
      }
    } catch (error) {
      console.error('タスク一括作成エラー:', error);
    } finally {
      setIsCreatingAll(false);
    }
  };

  // 会議関連のイベントタイプか判定
  const isMeetingType = ['meeting', 'call', 'calendar_meeting', 'decision'].includes(event.event_type);

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
  const TypeIcon = ICON_MAP[typeConfig.icon] || FileText;

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
            <TypeIcon className="w-3.5 h-3.5" />
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

        {/* Phase 56: 親子タスク提案セクション */}
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
                ) : !parentTask && childTasks.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2">提案するタスクが見つかりませんでした</p>
                ) : (
                  <div className="space-y-2">
                    {/* 親タスク */}
                    {parentTask && (
                      <div className="bg-purple-50 rounded-lg border border-purple-200 p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <ListChecks className="w-3.5 h-3.5 text-purple-600" />
                          <span className="text-xs font-bold text-purple-800">{parentTask.title}</span>
                        </div>
                        {parentTask.description && (
                          <p className="text-[11px] text-purple-600 line-clamp-2">{parentTask.description}</p>
                        )}
                      </div>
                    )}

                    {/* 子タスク一覧 */}
                    {childTasks.map((c, i) => (
                      <div key={i} className="bg-white rounded-lg border border-slate-200 p-3 ml-3 relative">
                        {/* ツリー接続線 */}
                        <div className="absolute -left-3 top-0 bottom-0 w-3 flex items-center">
                          <div className="w-3 h-px bg-slate-300" />
                        </div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${PRIORITY_LABELS[c.priority]?.color || ''}`}>
                                {PRIORITY_LABELS[c.priority]?.label || c.priority}
                              </span>
                              <span className="text-xs font-medium text-slate-800 truncate">{c.title}</span>
                            </div>
                            {c.description && (
                              <p className="text-[11px] text-slate-500 line-clamp-2">{c.description}</p>
                            )}
                            {c.assigneeName && (
                              <div className="flex items-center gap-1 mt-1">
                                <Users className="w-3 h-3 text-slate-400" />
                                <span className="text-[10px] text-slate-500">
                                  {c.assigneeName}
                                  {c.assigneeContactId && (
                                    <span className="text-green-600 ml-1">&#10003;</span>
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* 一括作成ボタン */}
                    {childTasks.length > 0 && (
                      <div className="mt-3">
                        {allCreated ? (
                          <div className="flex items-center gap-2 justify-center py-2 bg-green-50 rounded-lg border border-green-200">
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                            <span className="text-xs font-medium text-green-700">タスクを作成しました</span>
                          </div>
                        ) : (
                          <Button
                            onClick={handleCreateAllTasks}
                            disabled={isCreatingAll}
                            icon={isCreatingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            variant="primary"
                            size="sm"
                            className="w-full"
                          >
                            {isCreatingAll ? '作成中...' : `全て作成（${childTasks.length}件）`}
                          </Button>
                        )}
                      </div>
                    )}
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
