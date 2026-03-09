// V2-F: 個別の評価結果カード
'use client';

import { Clock } from 'lucide-react';
import PresentationSummary from './PresentationSummary';

interface Evaluation {
  id: string;
  milestone_id: string;
  evaluation_type: string;
  achievement_level: 'achieved' | 'partially' | 'missed';
  ai_analysis: string | null;
  deviation_summary: string | null;
  correction_suggestion: string | null;
  presentation_summary: string | null;
  evaluated_at: string;
}

interface EvaluationResultProps {
  evaluation: Evaluation;
  milestoneTitle: string;
  isLatest?: boolean;
}

const LEVEL_CONFIG = {
  achieved: {
    emoji: '\uD83D\uDFE2',
    label: 'achieved',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
  },
  partially: {
    emoji: '\uD83D\uDFE1',
    label: 'partially',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
  },
  missed: {
    emoji: '\uD83D\uDD34',
    label: 'missed',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
  },
} as const;

export default function EvaluationResult({
  evaluation,
  milestoneTitle,
  isLatest = false,
}: EvaluationResultProps) {
  const config = LEVEL_CONFIG[evaluation.achievement_level] || LEVEL_CONFIG.partially;

  return (
    <div className={`rounded-lg border ${isLatest ? config.borderColor : 'border-slate-200'} ${isLatest ? config.bgColor : 'bg-white'} p-4`}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${config.color}`}>
            {config.emoji} {config.label}
          </span>
          {isLatest && (
            <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
              最新
            </span>
          )}
          <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full">
            {evaluation.evaluation_type === 'manual' ? '手動' : '自動'}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-slate-400">
          <Clock className="w-3 h-3" />
          {new Date(evaluation.evaluated_at).toLocaleString('ja-JP', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>

      {/* 分析 */}
      {evaluation.ai_analysis && (
        <div className="mb-3">
          <h4 className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">
            分析
          </h4>
          <p className="text-xs text-slate-700 leading-relaxed">
            {evaluation.ai_analysis}
          </p>
        </div>
      )}

      {/* ズレ */}
      {evaluation.deviation_summary && (
        <div className="mb-3">
          <h4 className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">
            ズレ
          </h4>
          <p className="text-xs text-slate-700 leading-relaxed">
            {evaluation.deviation_summary}
          </p>
        </div>
      )}

      {/* 提案 */}
      {evaluation.correction_suggestion && (
        <div className="mb-3">
          <h4 className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">
            提案
          </h4>
          <p className="text-xs text-slate-700 leading-relaxed">
            {evaluation.correction_suggestion}
          </p>
        </div>
      )}

      {/* 会議用サマリー */}
      {evaluation.presentation_summary && (
        <PresentationSummary
          summary={evaluation.presentation_summary}
          milestoneTitle={milestoneTitle}
          achievementLevel={evaluation.achievement_level}
        />
      )}
    </div>
  );
}
