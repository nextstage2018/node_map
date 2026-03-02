'use client';

import { useState } from 'react';
import {
  FileText, Phone, Mail, MessageSquare,
  Handshake, X, Users, Bookmark,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { EVENT_TYPE_CONFIG, ContactOption } from './types';

// アイコンマッピング
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText, Phone, Mail, MessageSquare, Handshake, Bookmark,
};

interface EventFormProps {
  contacts: ContactOption[];
  onSubmit: (data: {
    title: string;
    content: string;
    eventType: string;
    minutes: string;
    decision: string;
    participants: string[];
  }) => Promise<void>;
  onClose: () => void;
}

export default function EventForm({ contacts, onSubmit, onClose }: EventFormProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [eventType, setEventType] = useState('note');
  const [minutes, setMinutes] = useState('');
  const [decision, setDecision] = useState('');
  const [participants, setParticipants] = useState<string[]>([]);

  const toggleParticipant = (contactId: string) => {
    setParticipants((prev) =>
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId]
    );
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;
    await onSubmit({ title, content, eventType, minutes, decision, participants });
  };

  return (
    <Card variant="default" padding="md" className="mx-6 mt-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">新しいイベントを記録</h3>
        <Button onClick={onClose} icon={<X className="w-4 h-4" />} variant="ghost" size="sm" />
      </div>
      <div className="space-y-3">
        {/* イベント種別 */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(EVENT_TYPE_CONFIG)
            .filter(([key]) => !['document_received', 'document_submitted', 'summary'].includes(key))
            .map(([key, config]) => {
              const Icon = ICON_MAP[config.icon] || FileText;
              return (
                <button
                  key={key}
                  onClick={() => setEventType(key)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    eventType === key ? 'ring-2 ring-offset-1 ring-blue-400' : ''
                  } ${config.color}`}
                >
                  <Icon className="w-3 h-3" />
                  {config.label}
                </button>
              );
            })}
        </div>

        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="タイトル"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="詳細（任意）"
          rows={2}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />

        {/* 参加者選択 */}
        {(eventType === 'meeting' || eventType === 'call') && contacts.length > 0 && (
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1.5">
              <Users className="w-3.5 h-3.5" />
              参加者
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {contacts.map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggleParticipant(c.id)}
                  className={`px-2 py-1 rounded-full text-xs transition-colors ${
                    participants.includes(c.id)
                      ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 議事録 */}
        {eventType === 'meeting' && (
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1.5">
              <FileText className="w-3.5 h-3.5" />
              議事録
            </label>
            <textarea
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="議事の内容を記録..."
              rows={4}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        )}

        {/* 意思決定ログ */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1.5">
            <Bookmark className="w-3.5 h-3.5" />
            意思決定ログ（任意）
          </label>
          <textarea
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
            placeholder="決定事項があれば記録..."
            rows={2}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="outline" size="sm">
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim()} variant="primary" size="sm">
            記録する
          </Button>
        </div>
      </div>
    </Card>
  );
}
