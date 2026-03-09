// V2-F: マイルストーンセクション
// タスクタブ内にマイルストーン一覧を表示し、展開時に評価セクションを表示
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Flag, ChevronDown, ChevronRight, Calendar, RefreshCw } from 'lucide-react';
import MilestoneEvaluation from './MilestoneEvaluation';

interface Milestone {
  id: string;
  project_id: string;
  theme_id: string | null;
  title: string;
  description: string | null;
  start_context: string | null;
  target_date: string | null;
  achieved_date: string | null;
  status: string;
  sort_order: number;
  task_total: number;
  task_completed: number;
  created_at: string;
  updated_at: string;
}

interface MilestoneSectionProps {
  projectId: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  pending: { label: '未開始', color: 'text-slate-500', bgColor: 'bg-slate-100' },
  in_progress: { label: '進行中', color: 'text-blue-600', bgColor: 'bg-blue-50' },
  achieved: { label: '達成', color: 'text-green-600', bgColor: 'bg-green-50' },
  missed: { label: '未達', color: 'text-red-600', bgColor: 'bg-red-50' },
};

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-[10px] text-slate-400 shrink-0">
        {completed}/{total}
      </span>
    </div>
  );
}

function MilestoneCard({ milestone, onStatusUpdate }: { milestone: Milestone; onStatusUpdate: (id: string, status: string) => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const config = STATUS_CONFIG[milestone.status] || STATUS_CONFIG.pending;

  const handleStatusUpdate = (newStatus: string) => {
    onStatusUpdate(milestone.id, newStatus);
  };

  return (
    <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
      {/* ヘッダー（クリックで展開） */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="shrink-0">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
        </div>
        <Flag className="w-4 h-4 text-red-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-900 truncate">
              {milestone.title}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${config.bgColor} ${config.color}`}>
              {config.label}
            </span>
          </div>
          {milestone.description && (
            <p className="text-xs text-slate-500 truncate mt-0.5">
              ゴール: {milestone.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1">
            {milestone.target_date && (
              <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                <Calendar className="w-3 h-3" />
                {new Date(milestone.target_date).toLocaleDateString('ja-JP', {
                  month: 'short',
                  day: 'numeric',
                  weekday: 'short',
                })}
              </span>
            )}
            {milestone.task_total > 0 && (
              <div className="flex-1 max-w-[120px]">
                <ProgressBar completed={milestone.task_completed} total={milestone.task_total} />
              </div>
            )}
          </div>
        </div>
      </button>

      {/* 展開部分: 評価セクション */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-slate-100">
          {milestone.start_context && (
            <div className="mt-3 mb-2">
              <span className="text-[10px] font-medium text-slate-500">スタート地点:</span>
              <p className="text-xs text-slate-600 mt-0.5">{milestone.start_context}</p>
            </div>
          )}
          <MilestoneEvaluation
            milestoneId={milestone.id}
            milestoneTitle={milestone.title}
            onStatusUpdate={handleStatusUpdate}
          />
        </div>
      )}
    </div>
  );
}

export default function MilestoneSection({ projectId }: MilestoneSectionProps) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchMilestones = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/milestones?project_id=${projectId}`);
      const data = await res.json();
      if (data.success) {
        setMilestones(data.data || []);
      }
    } catch {
      // 取得失敗は静かに処理
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchMilestones();
  }, [fetchMilestones]);

  // 評価後のステータス更新をローカルstateに反映
  const handleStatusUpdate = (milestoneId: string, newStatus: string) => {
    setMilestones((prev) =>
      prev.map((ms) =>
        ms.id === milestoneId
          ? {
              ...ms,
              status: newStatus,
              achieved_date: newStatus === 'achieved' ? new Date().toISOString().split('T')[0] : ms.achieved_date,
            }
          : ms
      )
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4 text-slate-400">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
        <span className="text-xs">マイルストーン読み込み中...</span>
      </div>
    );
  }

  if (milestones.length === 0) {
    return null; // マイルストーンがなければ何も表示しない
  }

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Flag className="w-3.5 h-3.5 text-red-400" />
        <h4 className="text-xs font-medium text-slate-600">
          マイルストーン
        </h4>
        <span className="text-[10px] text-slate-400">
          {milestones.filter((m) => m.status === 'achieved').length}/{milestones.length} 達成
        </span>
      </div>
      <div className="space-y-2">
        {milestones.map((ms) => (
          <MilestoneCard
            key={ms.id}
            milestone={ms}
            onStatusUpdate={handleStatusUpdate}
          />
        ))}
      </div>
    </div>
  );
}
