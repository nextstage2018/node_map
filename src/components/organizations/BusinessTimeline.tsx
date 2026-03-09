// Phase UI-7: ビジネスログ タイムラインUI（PJ配下の時間軸タイムライン）
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Calendar, GitCommit, MessageSquare, CheckCircle, FileText,
  Flag, StickyNote, ChevronDown, ChevronRight, Filter,
  Clock, Bot, Phone, Mail, Handshake, Bookmark,
  Loader2, X,
} from 'lucide-react';
import {
  BusinessEvent, EVENT_TYPE_CONFIG,
} from '@/components/business-log/types';
import EventDetail from '@/components/business-log/EventDetail';

// ========================================
// タイムライン用イベント種別とアイコン・色
// ========================================
const TIMELINE_TYPE_CONFIG: Record<string, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  borderColor: string;
  bgColor: string;
  textColor: string;
}> = {
  meeting: { label: '会議', icon: Calendar, borderColor: 'border-l-blue-400', bgColor: 'bg-blue-50', textColor: 'text-blue-600' },
  calendar_meeting: { label: '会議', icon: Calendar, borderColor: 'border-l-blue-400', bgColor: 'bg-blue-50', textColor: 'text-blue-600' },
  call: { label: '電話', icon: Phone, borderColor: 'border-l-blue-400', bgColor: 'bg-blue-50', textColor: 'text-blue-600' },
  decision: { label: '意思決定', icon: GitCommit, borderColor: 'border-l-purple-400', bgColor: 'bg-purple-50', textColor: 'text-purple-600' },
  chat: { label: 'メッセージ', icon: MessageSquare, borderColor: 'border-l-slate-400', bgColor: 'bg-slate-50', textColor: 'text-slate-600' },
  email: { label: 'メール', icon: Mail, borderColor: 'border-l-slate-400', bgColor: 'bg-slate-50', textColor: 'text-slate-600' },
  task_completed: { label: 'タスク完了', icon: CheckCircle, borderColor: 'border-l-green-400', bgColor: 'bg-green-50', textColor: 'text-green-600' },
  document_received: { label: '書類受領', icon: FileText, borderColor: 'border-l-amber-400', bgColor: 'bg-amber-50', textColor: 'text-amber-600' },
  document_submitted: { label: '書類提出', icon: FileText, borderColor: 'border-l-amber-400', bgColor: 'bg-amber-50', textColor: 'text-amber-600' },
  note: { label: 'メモ', icon: StickyNote, borderColor: 'border-l-slate-400', bgColor: 'bg-slate-50', textColor: 'text-slate-600' },
  summary: { label: 'AI要約', icon: Bot, borderColor: 'border-l-indigo-400', bgColor: 'bg-indigo-50', textColor: 'text-indigo-600' },
};

function getTimelineConfig(eventType: string) {
  return TIMELINE_TYPE_CONFIG[eventType] || TIMELINE_TYPE_CONFIG.note;
}

// フィルタチップ
const FILTER_CHIPS = [
  { key: 'all', label: 'すべて' },
  { key: 'meeting', label: '会議', match: ['meeting', 'calendar_meeting', 'call'] },
  { key: 'decision', label: '意思決定', match: ['decision'] },
  { key: 'message', label: 'メッセージ', match: ['chat', 'email'] },
  { key: 'file', label: 'ファイル', match: ['document_received', 'document_submitted'] },
  { key: 'task', label: 'タスク', match: ['task_completed'] },
];

// ========================================
// 月ごとのグルーピング
// ========================================
function groupByMonth(events: BusinessEvent[]): Map<string, BusinessEvent[]> {
  const groups = new Map<string, BusinessEvent[]>();
  const sorted = [...events].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  for (const event of sorted) {
    const d = new Date(event.created_at);
    const key = `${d.getFullYear()}年${d.getMonth() + 1}月`;
    const arr = groups.get(key) || [];
    arr.push(event);
    groups.set(key, arr);
  }
  return groups;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

// ========================================
// Props
// ========================================
interface BusinessTimelineProps {
  projectId: string;
  projectName: string;
}

// ========================================
// メインコンポーネント
// ========================================
export default function BusinessTimeline({ projectId, projectName }: BusinessTimelineProps) {
  const [events, setEvents] = useState<BusinessEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterKey, setFilterKey] = useState('all');
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  // 詳細表示
  const [selectedEvent, setSelectedEvent] = useState<BusinessEvent | null>(null);

  // データ取得
  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/business-events?project_id=${projectId}`);
      const data = await res.json();
      if (data.success) setEvents(data.data || []);
    } catch { /* ignore */ }
    finally { setIsLoading(false); }
  }, [projectId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // フィルタ適用
  const filteredEvents = events.filter((event) => {
    if (filterKey === 'all') return !event.summary_period; // 要約は除外
    const chip = FILTER_CHIPS.find((c) => c.key === filterKey);
    if (!chip || !('match' in chip)) return true;
    return (chip as { match: string[] }).match.includes(event.event_type);
  });

  const monthGroups = groupByMonth(filteredEvents);

  // アコーディオン
  const toggleExpand = (eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };


  return (
    <div className="flex flex-1 overflow-hidden">
      {/* メインタイムライン */}
      <div className={`flex-1 overflow-y-auto ${selectedEvent ? 'border-r border-slate-200' : ''}`}>
        {/* ヘッダー: フィルタ */}
        <div className="px-4 py-3 border-b border-slate-100 bg-white sticky top-0 z-10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500">{filteredEvents.length}件のイベント</span>
          </div>
          {/* フィルタチップ */}
          <div className="flex gap-1.5 flex-wrap">
            {FILTER_CHIPS.map((chip) => (
              <button
                key={chip.key}
                onClick={() => setFilterKey(chip.key)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  filterKey === chip.key
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* タイムライン本体 */}
        <div className="px-4 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Clock className="w-10 h-10 mb-3 text-slate-300" />
              <p className="text-sm">イベントがありません</p>
              <p className="text-xs mt-1">検討ツリータブから会議録を登録するとイベントが自動生成されます</p>
            </div>
          ) : (
            Array.from(monthGroups.entries()).map(([monthLabel, monthEvents]) => (
              <div key={monthLabel} className="mb-6">
                {/* 月ヘッダー */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full">
                    {monthLabel}
                  </span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                {/* タイムラインアイテム */}
                <div className="relative ml-3">
                  {/* 縦線 */}
                  <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-200" />

                  <div className="space-y-3">
                    {monthEvents.map((event) => {
                      const config = getTimelineConfig(event.event_type);
                      const Icon = config.icon;
                      const isExpanded = expandedEvents.has(event.id);
                      const isAuto = event.ai_generated;

                      return (
                        <div key={event.id} className="relative flex gap-3">
                          {/* タイムラインドット */}
                          <div className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${config.bgColor} ring-2 ring-white`}>
                            <Icon className={`w-3.5 h-3.5 ${config.textColor}`} />
                          </div>

                          {/* イベントカード */}
                          <div
                            className={`flex-1 min-w-0 rounded-lg border-l-[3px] bg-white border border-slate-200 transition-all cursor-pointer hover:shadow-sm ${config.borderColor} ${
                              isAuto ? 'opacity-75' : ''
                            }`}
                            onClick={() => toggleExpand(event.id)}
                          >
                            {/* カードヘッダー */}
                            <div className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-medium text-slate-400 shrink-0">
                                  {formatDate(event.created_at)}
                                </span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${config.bgColor} ${config.textColor}`}>
                                  {config.label}
                                </span>
                                <span className="text-sm font-medium text-slate-900 truncate flex-1">
                                  {event.title}
                                </span>
                                {isAuto && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-500 shrink-0">
                                    <Bot className="w-2.5 h-2.5 inline mr-0.5" />自動
                                  </span>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedEvent(event);
                                  }}
                                  className="text-slate-400 hover:text-blue-500 transition-colors shrink-0"
                                  title="詳細"
                                >
                                  <ChevronRight className="w-4 h-4" />
                                </button>
                              </div>

                              {/* 展開コンテンツ */}
                              {isExpanded && event.content && (
                                <div className="mt-2 pt-2 border-t border-slate-100">
                                  <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
                                    {event.content}
                                  </p>
                                  {event.contact_persons && (
                                    <p className="text-[10px] text-slate-400 mt-2">
                                      関連: {event.contact_persons.name}
                                    </p>
                                  )}
                                  <p className="text-[10px] text-slate-400 mt-1">
                                    {formatTime(event.created_at)}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 右パネル: イベント詳細 */}
      {selectedEvent && (
        <div className="w-80 shrink-0 overflow-y-auto">
          <EventDetail
            event={selectedEvent}
            project={{ id: projectId, name: projectName, description: null, status: 'active', created_at: '', updated_at: '' }}
            onClose={() => setSelectedEvent(null)}
          />
        </div>
      )}
    </div>
  );
}
