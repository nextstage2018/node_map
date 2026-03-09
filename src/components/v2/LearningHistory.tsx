// V2-G: 学習データ一覧コンポーネント
// マイルストーン評価セクションに表示する学習履歴
'use client';

import { useState, useEffect, useCallback } from 'react';
import { BookOpen, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

interface LearningEntry {
  id: string;
  milestone_id: string;
  project_id: string;
  ai_judgment: string;
  ai_reasoning: string | null;
  human_judgment: string | null;
  human_reasoning: string | null;
  gap_analysis: string | null;
  learning_point: string | null;
  applied_count: number;
  meeting_record_id: string | null;
  created_at: string;
}

interface LearningHistoryProps {
  projectId: string;
}

export default function LearningHistory({ projectId }: LearningHistoryProps) {
  const [learnings, setLearnings] = useState<LearningEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const fetchLearnings = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/evaluation-learnings?project_id=${projectId}`);
      const data = await res.json();
      if (data.success) {
        setLearnings(data.data || []);
      }
    } catch {
      // 取得失敗しても静かに処理
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchLearnings();
  }, [fetchLearnings]);

  if (isLoading && learnings.length === 0) {
    return (
      <div className="flex items-center gap-2 py-2 text-slate-400">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        <span className="text-xs">学習データ読み込み中...</span>
      </div>
    );
  }

  if (learnings.length === 0) {
    return null; // 学習データがない場合は非表示
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const judgmentLabel = (judgment: string | null) => {
    if (!judgment) return '';
    switch (judgment) {
      case 'achieved': return '達成';
      case 'partially': return '部分的';
      case 'missed': return '未達';
      default: return judgment;
    }
  };

  return (
    <div className="mt-4 border-t border-slate-200 pt-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 transition-colors"
      >
        <BookOpen className="w-3.5 h-3.5" />
        <span>このプロジェクトの学習データ ({learnings.length}件)</span>
        {isExpanded ? (
          <ChevronUp className="w-3 h-3 ml-1" />
        ) : (
          <ChevronDown className="w-3 h-3 ml-1" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-2">
          {learnings.map((learning, index) => (
            <div
              key={learning.id}
              className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg"
            >
              <div className="flex items-start gap-2">
                <span className="text-[10px] font-mono text-slate-400 mt-0.5 shrink-0">
                  {index + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  {learning.learning_point && (
                    <p className="text-xs text-slate-700 leading-relaxed">
                      {learning.learning_point}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400">
                    <span>{formatDate(learning.created_at)}</span>
                    {learning.ai_judgment && learning.human_judgment && (
                      <span>
                        AI: {judgmentLabel(learning.ai_judgment)} → 人間: {judgmentLabel(learning.human_judgment)}
                      </span>
                    )}
                    {learning.applied_count > 0 && (
                      <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">
                        適用{learning.applied_count}回
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
