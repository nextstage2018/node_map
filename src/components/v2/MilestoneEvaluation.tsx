// V2-F: マイルストーン評価セクション
// 評価実行ボタン + 最新評価結果 + 履歴表示
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Play, RefreshCw, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import EvaluationResult from './EvaluationResult';

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

interface MilestoneEvaluationProps {
  milestoneId: string;
  milestoneTitle: string;
  onStatusUpdate?: (newStatus: string) => void;
}

export default function MilestoneEvaluation({
  milestoneId,
  milestoneTitle,
  onStatusUpdate,
}: MilestoneEvaluationProps) {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // 評価履歴の取得
  const fetchEvaluations = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/milestones/${milestoneId}/evaluations`);
      const data = await res.json();
      if (data.success) {
        setEvaluations(data.data || []);
      }
    } catch {
      // 取得失敗しても静かに処理
    } finally {
      setIsLoading(false);
    }
  }, [milestoneId]);

  useEffect(() => {
    fetchEvaluations();
  }, [fetchEvaluations]);

  // 評価実行
  const handleEvaluate = async () => {
    setIsEvaluating(true);
    setError(null);
    try {
      const res = await fetch(`/api/milestones/${milestoneId}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        // 評価結果をリストの先頭に追加
        setEvaluations((prev) => [data.data.evaluation, ...prev]);
        // マイルストーンのステータス更新を親に通知
        if (onStatusUpdate && data.data.milestone_status) {
          onStatusUpdate(data.data.milestone_status);
        }
      } else {
        setError(data.error || '評価に失敗しました');
      }
    } catch {
      setError('ネットワークエラーが発生しました');
    } finally {
      setIsEvaluating(false);
    }
  };

  const latestEvaluation = evaluations[0] || null;
  const historyEvaluations = evaluations.slice(1);

  return (
    <div className="mt-4 space-y-3">
      {/* 評価実行ボタン */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleEvaluate}
          disabled={isEvaluating}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            isEvaluating
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isEvaluating ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              評価中...
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              チェックポイント評価を実行
            </>
          )}
        </button>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <span className="text-xs text-red-700">{error}</span>
          <button
            onClick={handleEvaluate}
            className="ml-auto text-[10px] px-2 py-1 text-red-600 bg-white border border-red-200 rounded hover:bg-red-50 transition-colors"
          >
            再試行
          </button>
        </div>
      )}

      {/* ローディング */}
      {isLoading && evaluations.length === 0 && (
        <div className="flex items-center justify-center py-4 text-slate-400">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" />
          <span className="text-xs">読み込み中...</span>
        </div>
      )}

      {/* 最新の評価結果 */}
      {latestEvaluation && (
        <div>
          <h4 className="text-xs font-medium text-slate-600 mb-2 border-t border-slate-200 pt-3">
            最新の評価結果
          </h4>
          <EvaluationResult
            evaluation={latestEvaluation}
            milestoneTitle={milestoneTitle}
            isLatest
          />
        </div>
      )}

      {/* 評価履歴 */}
      {historyEvaluations.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            {showHistory ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
            過去の評価（{historyEvaluations.length}件）
          </button>
          {showHistory && (
            <div className="mt-2 space-y-2">
              {historyEvaluations.map((evaluation) => (
                <EvaluationResult
                  key={evaluation.id}
                  evaluation={evaluation}
                  milestoneTitle={milestoneTitle}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
