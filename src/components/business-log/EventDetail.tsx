'use client';

import { useState } from 'react';
import {
  FolderOpen, FileText, Phone, Mail, MessageSquare,
  Handshake, X, Pencil, Trash2, AlertTriangle, Bookmark, Bot,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { BusinessEvent, EVENT_TYPE_CONFIG, Project, formatDateTime } from './types';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText, Phone, Mail, MessageSquare, Handshake, Bookmark,
};

interface EventDetailProps {
  event: BusinessEvent;
  project: Project | null;
  onClose: () => void;
  onUpdate: (data: { title: string; content: string; eventType: string }) => Promise<void>;
  onDelete: () => Promise<void>;
}

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

  if (isEditing) {
    return (
      <Card variant="flat" className="w-80 overflow-y-auto bg-slate-50 shrink-0">
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">イベント編集</h3>
            <Button onClick={() => setIsEditing(false)} icon={X} variant="ghost" size="sm" />
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(EVENT_TYPE_CONFIG)
                .filter(([key]) => !['document_received', 'document_submitted', 'summary'].includes(key))
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
            <Button onClick={() => setShowDeleteConfirm(true)} icon={Trash2} variant="ghost" size="sm" title="削除" />
            <Button onClick={onClose} icon={X} variant="ghost" size="sm" />
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
      </div>
    </Card>
  );
}
