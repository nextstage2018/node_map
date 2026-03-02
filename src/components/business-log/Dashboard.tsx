'use client';

import { useState, useEffect } from 'react';
import {
  Clock, TrendingUp, FolderOpen, Bot, Calendar,
  FileText, Phone, Mail, MessageSquare, Handshake, Bookmark,
  ChevronDown,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/EmptyState';
import { BusinessEvent, Project, EVENT_TYPE_CONFIG, formatDateTime } from './types';

interface DashboardProps {
  projects: Project[];
  onSelectProject: (id: string) => void;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText, Phone, Mail, MessageSquare, Handshake, Bookmark,
};

export default function Dashboard({ projects, onSelectProject }: DashboardProps) {
  const [recentEvents, setRecentEvents] = useState<BusinessEvent[]>([]);
  const [summaries, setSummaries] = useState<BusinessEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, aiGenerated: 0, thisWeek: 0 });

  useEffect(() => {
    const fetchDashboard = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/business-events');
        const data = await res.json();
        if (data.success && data.data) {
          const allEvents: BusinessEvent[] = data.data;

          // 統計計算
          const now = new Date();
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          const thisWeekEvents = allEvents.filter((e) => new Date(e.created_at) >= weekAgo);
          const aiEvents = allEvents.filter((e) => e.ai_generated);
          setStats({
            total: allEvents.length,
            aiGenerated: aiEvents.length,
            thisWeek: thisWeekEvents.length,
          });

          // 週間要約を抽出
          const summaryEvents = allEvents.filter((e) => e.summary_period);
          setSummaries(summaryEvents.slice(0, 3));

          // 直近イベント（要約以外）
          const regular = allEvents.filter((e) => !e.summary_period);
          setRecentEvents(regular.slice(0, 20));
        }
      } catch {
        // エラーは無視
      } finally {
        setIsLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  if (isLoading) return <div className="px-6 py-4"><LoadingState /></div>;

  // プロジェクトごとの直近アクティビティ
  const projectActivity = projects.map((p) => {
    const projEvents = recentEvents.filter((e) => e.project_id === p.id);
    return { ...p, recentCount: projEvents.length, latestEvent: projEvents[0] || null };
  }).sort((a, b) => b.recentCount - a.recentCount);

  return (
    <div className="px-6 py-6 space-y-6 overflow-y-auto">
      {/* 統計カード */}
      <div className="grid grid-cols-3 gap-4">
        <Card variant="default" padding="md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
              <p className="text-xs text-slate-400">全イベント</p>
            </div>
          </div>
        </Card>
        <Card variant="default" padding="md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{stats.thisWeek}</p>
              <p className="text-xs text-slate-400">今週のイベント</p>
            </div>
          </div>
        </Card>
        <Card variant="default" padding="md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
              <Bot className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{stats.aiGenerated}</p>
              <p className="text-xs text-slate-400">AI自動生成</p>
            </div>
          </div>
        </Card>
      </div>

      {/* 週間要約 */}
      {summaries.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">AI週間要約</h3>
          <div className="space-y-2">
            {summaries.map((summary) => (
              <SummaryCard key={summary.id} event={summary} />
            ))}
          </div>
        </div>
      )}

      {/* プロジェクト別アクティビティ */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">プロジェクト別アクティビティ</h3>
        <div className="grid grid-cols-2 gap-3">
          {projectActivity.slice(0, 6).map((p) => (
            <Card
              key={p.id}
              variant="outlined"
              padding="sm"
              hoverable
              onClick={() => onSelectProject(p.id)}
              className="cursor-pointer"
            >
              <div className="flex items-center gap-2 mb-2">
                <FolderOpen className="w-4 h-4 text-blue-500 shrink-0" />
                <span className="text-sm font-medium text-slate-900 truncate">{p.name}</span>
              </div>
              {p.organization_name && (
                <p className="text-[10px] text-slate-400 mb-1">{p.organization_name}</p>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{p.recentCount}件のイベント</span>
                {p.latestEvent && (
                  <span className="text-[10px] text-slate-400">{formatDateTime(p.latestEvent.created_at)}</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* 直近のイベント */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">直近のイベント</h3>
        <div className="space-y-2">
          {recentEvents.slice(0, 10).map((event) => {
            const typeConfig = EVENT_TYPE_CONFIG[event.event_type] || EVENT_TYPE_CONFIG.note;
            const Icon = ICON_MAP[typeConfig.icon] || FileText;
            return (
              <div
                key={event.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${typeConfig.color}`}>
                  <Icon className="w-3 h-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-900 truncate">{event.title}</span>
                    {event.ai_generated && (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-indigo-50 text-indigo-600">AI</span>
                    )}
                  </div>
                </div>
                {event.projects && (
                  <span className="text-[10px] text-slate-400 shrink-0">{(event.projects as any).name}</span>
                )}
                <span className="text-[10px] text-slate-400 shrink-0">{formatDateTime(event.created_at)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ event }: { event: BusinessEvent }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card variant="default" padding="md" className="border-indigo-200 bg-indigo-50/50">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-3 text-left">
        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
          <Calendar className="w-4 h-4 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-indigo-900">{event.title}</span>
          <span className="block text-[10px] text-indigo-500">
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
