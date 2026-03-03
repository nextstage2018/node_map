'use client';

import { useState, useEffect } from 'react';
import {
  FileText, Phone, Mail, MessageSquare,
  Handshake, X, Users, Calendar, Link2, Loader2,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { EVENT_TYPE_CONFIG, ContactOption } from './types';

// アイコンマッピング
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText, Phone, Mail, MessageSquare, Handshake,
};

interface CalendarEventOption {
  id: string;
  summary: string;
  start: string;
  end: string;
  attendees?: { email: string; displayName?: string }[];
}

interface EventFormProps {
  contacts: ContactOption[];
  projectId: string | null;
  onSubmit: (data: {
    title: string;
    content: string;
    eventType: string;
    participants: string[];
    calendarEventId?: string;
    meetingNotesUrl?: string;
    eventStart?: string;
    eventEnd?: string;
  }) => Promise<void>;
  onClose: () => void;
}

export default function EventForm({ contacts, projectId, onSubmit, onClose }: EventFormProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [eventType, setEventType] = useState('note');
  const [participants, setParticipants] = useState<string[]>([]);
  const [meetingNotesUrl, setMeetingNotesUrl] = useState('');
  const [selectedCalendarEventId, setSelectedCalendarEventId] = useState('');
  const [selectedEventStart, setSelectedEventStart] = useState('');
  const [selectedEventEnd, setSelectedEventEnd] = useState('');

  // カレンダーイベント一覧
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventOption[]>([]);
  const [meetingNotesMap, setMeetingNotesMap] = useState<Record<string, string>>({});
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(false);
  const [calendarLoaded, setCalendarLoaded] = useState(false);

  // プロジェクトメンバー
  const [projectMembers, setProjectMembers] = useState<ContactOption[]>([]);

  // meeting/call 選択時にカレンダーイベントをフェッチ
  useEffect(() => {
    if ((eventType === 'meeting' || eventType === 'call') && !calendarLoaded) {
      fetchCalendarEvents();
    }
  }, [eventType, calendarLoaded]);

  // プロジェクトメンバーをフェッチ
  useEffect(() => {
    if (projectId && (eventType === 'meeting' || eventType === 'call')) {
      fetchProjectMembers();
    }
  }, [projectId, eventType]);

  const fetchCalendarEvents = async () => {
    setIsLoadingCalendar(true);
    try {
      const res = await fetch('/api/calendar/past-events?days=14');
      const data = await res.json();
      if (data.success) {
        setCalendarEvents(data.data.events || []);
        setMeetingNotesMap(data.data.meetingNotesUrls || {});
        setCalendarLoaded(true);
      }
    } catch (error) {
      console.error('カレンダーイベント取得エラー:', error);
    } finally {
      setIsLoadingCalendar(false);
    }
  };

  const fetchProjectMembers = async () => {
    try {
      const res = await fetch(`/api/project-members?project_id=${projectId}`);
      const data = await res.json();
      if (data.success && data.data) {
        const members: ContactOption[] = data.data
          .filter((m: Record<string, unknown>) => m.contact_persons)
          .map((m: Record<string, unknown>) => {
            const cp = m.contact_persons as { id: string; display_name?: string; email?: string };
            return { id: cp.id, name: cp.display_name || cp.email || '不明' };
          });
        setProjectMembers(members);
      }
    } catch (error) {
      console.error('プロジェクトメンバー取得エラー:', error);
    }
  };

  const handleCalendarEventSelect = (eventId: string) => {
    setSelectedCalendarEventId(eventId);
    const event = calendarEvents.find((e) => e.id === eventId);
    if (event) {
      setTitle(event.summary);
      setSelectedEventStart(event.start);
      setSelectedEventEnd(event.end);

      // 議事録URL自動入力
      if (meetingNotesMap[eventId]) {
        setMeetingNotesUrl(meetingNotesMap[eventId]);
      }

      // attendees からコンタクトをマッチして参加者に自動設定
      if (event.attendees && event.attendees.length > 0) {
        const availableContacts = displayContacts;
        const matched: string[] = [];
        for (const attendee of event.attendees) {
          const emailLower = attendee.email?.toLowerCase();
          const nameLower = attendee.displayName?.toLowerCase();
          const found = availableContacts.find(
            (c) => c.name.toLowerCase() === nameLower || c.name.toLowerCase() === emailLower
          );
          if (found) {
            matched.push(found.id);
          }
        }
        if (matched.length > 0) {
          setParticipants(matched);
        }
      }
    }
  };

  const toggleParticipant = (contactId: string) => {
    setParticipants((prev) =>
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId]
    );
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;
    await onSubmit({
      title,
      content,
      eventType,
      participants,
      calendarEventId: selectedCalendarEventId || undefined,
      meetingNotesUrl: meetingNotesUrl || undefined,
      eventStart: selectedEventStart || undefined,
      eventEnd: selectedEventEnd || undefined,
    });
  };

  // 参加者候補: プロジェクトメンバー優先、なければ全コンタクト
  const displayContacts = (projectId && projectMembers.length > 0) ? projectMembers : contacts;

  const formatCalendarTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
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
            .filter(([key]) => !['document_received', 'document_submitted', 'summary', 'task_completed', 'calendar_meeting'].includes(key))
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

        {/* カレンダーイベント選択（meeting/call時のみ） */}
        {(eventType === 'meeting' || eventType === 'call') && (
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1.5">
              <Calendar className="w-3.5 h-3.5" />
              カレンダーから選択（任意）
            </label>
            {isLoadingCalendar ? (
              <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                カレンダーを読み込み中...
              </div>
            ) : calendarEvents.length > 0 ? (
              <select
                value={selectedCalendarEventId}
                onChange={(e) => handleCalendarEventSelect(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">選択してください</option>
                {calendarEvents.map((event) => (
                  <option key={event.id} value={event.id}>
                    {formatCalendarTime(event.start)} - {event.summary}
                    {meetingNotesMap[event.id] ? ' 📝' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-slate-400 py-1">直近のカレンダー予定がありません</p>
            )}
          </div>
        )}

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
          placeholder="メモ（議事録・決定事項など）"
          rows={4}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />

        {/* 議事録URL（meeting/call時のみ） */}
        {(eventType === 'meeting' || eventType === 'call') && (
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1.5">
              <Link2 className="w-3.5 h-3.5" />
              議事録URL（任意）
            </label>
            <input
              type="url"
              value={meetingNotesUrl}
              onChange={(e) => setMeetingNotesUrl(e.target.value)}
              placeholder="https://docs.google.com/document/d/..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {/* 参加者選択 */}
        {(eventType === 'meeting' || eventType === 'call') && displayContacts.length > 0 && (
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1.5">
              <Users className="w-3.5 h-3.5" />
              参加者
              {projectId && projectMembers.length > 0 && (
                <span className="text-slate-400 font-normal">（プロジェクトメンバー）</span>
              )}
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {displayContacts.map((c) => (
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
