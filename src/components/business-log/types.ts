// ビジネスログ共有型定義
import { ReactNode } from 'react';

export interface Organization {
  id: string;
  name: string;
  relationship_type?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  organization_id?: string | null;
  organization_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectChannel {
  id: string;
  project_id: string;
  organization_channel_id?: string;
  service_name: string;
  channel_identifier: string;
  channel_label?: string;
  created_at: string;
}

export interface ChannelMessage {
  id: string;
  subject?: string;
  body?: string;
  from_name?: string;
  from_address?: string;
  timestamp: string;
  channel?: string;
  direction?: string;
  metadata?: Record<string, any>;
}

export interface BusinessEvent {
  id: string;
  title: string;
  content: string | null;
  event_type: string;
  project_id: string | null;
  group_id: string | null;
  contact_id: string | null;
  created_at: string;
  updated_at: string;
  // Phase 45c: AI自動生成イベント
  ai_generated?: boolean;
  summary_period?: string | null;
  source_message_id?: string | null;
  source_channel?: string | null;
  event_date?: string | null;
  // JOIN結果
  contact_persons?: { id: string; name: string; company_name?: string } | null;
  projects?: { id: string; name: string } | null;
}

export interface ContactOption {
  id: string;
  name: string;
}

// イベント種別設定
export const EVENT_TYPE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  note: { label: 'メモ', icon: 'FileText', color: 'bg-slate-100 text-slate-600' },
  meeting: { label: '打ち合わせ', icon: 'Handshake', color: 'bg-blue-100 text-blue-700' },
  call: { label: '電話', icon: 'Phone', color: 'bg-green-100 text-green-700' },
  email: { label: 'メール', icon: 'Mail', color: 'bg-orange-100 text-orange-700' },
  chat: { label: 'チャット', icon: 'MessageSquare', color: 'bg-purple-100 text-purple-700' },
  decision: { label: '意思決定', icon: 'Bookmark', color: 'bg-red-100 text-red-700' },
  // AI自動生成イベント用
  document_received: { label: '書類受領', icon: 'FileText', color: 'bg-teal-100 text-teal-700' },
  document_submitted: { label: '書類提出', icon: 'FileText', color: 'bg-cyan-100 text-cyan-700' },
  summary: { label: 'AI要約', icon: 'FileText', color: 'bg-indigo-100 text-indigo-700' },
};

export const PROJECT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: '進行中', color: 'bg-green-100 text-green-700' },
  completed: { label: '完了', color: 'bg-slate-100 text-slate-500' },
  on_hold: { label: '保留', color: 'bg-orange-100 text-orange-700' },
};

// ユーティリティ
export function formatDateTime(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const time = d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  if (days === 0) return `今日 ${time}`;
  if (days === 1) return `昨日 ${time}`;
  if (days < 7) return `${days}日前 ${time}`;
  return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }) + ` ${time}`;
}

export function groupEventsByDate(events: BusinessEvent[]): Map<string, BusinessEvent[]> {
  const groups = new Map<string, BusinessEvent[]>();
  for (const event of events) {
    const date = new Date(event.created_at).toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
    });
    const existing = groups.get(date) || [];
    existing.push(event);
    groups.set(date, existing);
  }
  return groups;
}

// フィルタ
export interface EventFilter {
  eventType: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  aiOnly: boolean;
}

export const defaultFilter: EventFilter = {
  eventType: null,
  dateFrom: null,
  dateTo: null,
  aiOnly: false,
};
