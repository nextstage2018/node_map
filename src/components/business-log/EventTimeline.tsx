'use client';

import { useState } from 'react';
import {
  Clock, FileText, Phone, Mail, MessageSquare,
  Handshake, ChevronRight, Bookmark, Bot, ChevronDown, Filter, X, Calendar,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  BusinessEvent, EVENT_TYPE_CONFIG, EventFilter, defaultFilter,
  formatDateTime, groupEventsByDate,
} from './types';
import { LoadingState } from '@/components/ui/EmptyState';

// アイコンマッピング
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText, Phone, Mail, MessageSquare, Handshake, Bookmark,
};

interface EventTimelineProps {
  events: BusinessEvent[];
  isLoading: boolean;
  selectedEventId: string | null;
  onSelectEvent: (event: BusinessEvent | null) => void;
}

export default function EventTimeline({
  events,
  isLoading,
  selectedEventId,
  onSelectEvent,
}: EventTimelineProps) {
  const [filter, setFilter] = useState<EventFilter>(defaultFilter);
  const [showFilter, setShowFilter] = useState(false);

  // フィルタ適用
  const filteredEvents = events.filter((event) => {
    if (filter.eventType && event.event_type !== filter.eventType) return false;
    if (filter.aiOnly && !event.ai_generated) return false;
    if (filter.dateFrom) {
      const eventDate = new Date(event.created_at);
      const from = new Date(filter.dateFrom);
      if (eventDate < from) return false;
    }
    if (filter.dateTo) {
      const eventDate = new Date(event.created_at);
      const to = new Date(filter.dateTo);
      to.setHours(23, 59, 59);
      if (eventDate > to) return false;
    }
    return true;
  });

  // 週間要約とそれ以外を分離
  const summaryEvents = filteredEvents.filter((e) => e.summary_period);
  const regularEvents = filteredEvents.filter((e) => !e.summary_period);
  const eventsByDate = groupEventsByDate(regularEvents);

  const hasActiveFilter = filter.eventType || filter.dateFrom || filter.dateTo || filter.aiOnly;

  return (
    <div className="px-6 py-4">
      {/* フィルタバー */}
      <div className="flex items-center gap-2 mb-4">
        <Button
          onClick={() => setShowFilter(!showFilter)}
          variant={hasActiveFilter ? 'primary' : 'outline'}
          size="sm"
          icon={<Filter className="w-3.5 h-3.5" />}
        >
          フィルタ {hasActiveFilter && '(有効)'}
        </Button>
        {hasActiveFilter && (
          <Button
            onClick={() => setFilter(defaultFilter)}
            variant="ghost"
            size="sm"
            icon={<X className="w-3.5 h-3.5" />}
          >
            クリア
          </Button>
        )}
        <span className="text-xs text-slate-400 ml-auto">
          {filteredEvents.length}件 {hasActiveFilter && `/ ${events.length}件中`}
        </span>
      </div>

      {/* フィルタパネル */}
      {showFilter && (
        <Card variant="outlined" padding="sm" className="mb-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">種別</label>
              <select
                value={filter.eventType || ''}
                onChange={(e) => setFilter({ ...filter, eventType: e.target.value || null })}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">すべて</option>
                {Object.entries(EVENT_TYPE_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">AI自動のみ</label>
              <button
                onClick={() => setFilter({ ...filter, aiOnly: !filter.aiOnly })}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors w-full ${
                  filter.aiOnly
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Bot className="w-3 h-3 inline mr-1" />
                {filter.aiOnly ? 'ON' : 'OFF'}
              </button>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">開始日</label>
              <input
                type="date"
                value={filter.dateFrom || ''}
                onChange={(e) => setFilter({ ...filter, dateFrom: e.target.value || null })}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">終了日</label>
              <input
                type="date"
                value={filter.dateTo || ''}
                onChange={(e) => setFilter({ ...filter, dateTo: e.target.value || null })}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </Card>
      )}

      {/* 週間要約カード */}
      {summaryEvents.length > 0 && (
        <div className="mb-6 space-y-3">
          {summaryEvents.map((summary) => (
            <WeeklySummaryCard key={summary.id} event={summary} />
          ))}
        </div>
      )}

      {/* タイムライン本体 */}
      {isLoading ? (
        <LoadingState />
      ) : regularEvents.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-slate-400">
          <div className="text-center">
            <Clock className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-sm">イベントがありません</p>
            <p className="text-xs mt-1">「イベント記録」ボタンで最初のイベントを記録しましょう</p>
          </div>
        </div>
      ) : (
        Array.from(eventsByDate.entries()).map(([date, dayEvents]) => (
          <div key={date} className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-semibold text-slate-500">{date}</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
            <div className="space-y-2 ml-2">
              {dayEvents.map((event) => {
                const typeConfig = EVENT_TYPE_CONFIG[event.event_type] || EVENT_TYPE_CONFIG.note;
                const Icon = ICON_MAP[typeConfig.icon] || FileText;
                const isSelected = selectedEventId === event.id;
                return (
                  <Card
                    key={event.id}
                    variant={isSelected ? 'default' : 'outlined'}
                    padding="md"
                    hoverable
                    onClick={() => onSelectEvent(isSelected ? null : event)}
                    className={`w-full flex items-start gap-3 text-left cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50 border border-blue-200' : ''
                    }`}
                  >
                    <div className="flex flex-col items-center mt-0.5">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${typeConfig.color}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900 truncate">{event.title}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${typeConfig.color}`}>
                          {typeConfig.label}
                        </span>
                        {event.ai_generated && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0 bg-indigo-50 text-indigo-600 border border-indigo-200">
                            <Bot className="w-2.5 h-2.5 inline mr-0.5" />
                            AI
                          </span>
                        )}
                      </div>
                      {event.content && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{event.content}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-slate-400">
                          {formatDateTime(event.created_at)}
                        </span>
                        {event.contact_persons && (
                          <span className="text-[10px] text-slate-400">
                            - {event.contact_persons.name}
                          </span>
                        )}
                        {event.source_channel && (
                          <span className="text-[10px] px-1 py-0.5 bg-slate-100 rounded text-slate-400">
                            {event.source_channel}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 shrink-0 mt-1 transition-colors ${
                      isSelected ? 'text-blue-500' : 'text-slate-300'
                    }`} />
                  </Card>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// 週間要約カード
function WeeklySummaryCard({ event }: { event: BusinessEvent }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card variant="default" padding="md" className="border-indigo-200 bg-indigo-50/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 text-left"
      >
        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
          <Calendar className="w-4 h-4 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-indigo-900">{event.title}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600">
              AI週間要約
            </span>
          </div>
          <span className="text-[10px] text-indigo-500">
            {event.summary_period} | {formatDateTime(event.created_at)}
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 text-indigo-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && event.content && (
        <div className="mt-3 pt-3 border-t border-indigo-200">
          <p className="text-sm text-indigo-800 whitespace-pre-wrap leading-relaxed">{event.content}</p>
        </div>
      )}
    </Card>
  );
}
