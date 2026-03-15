// v8.0: マイルストーン提案パネル（検討ツリータブに配置）
// 会議録AI解析から自動抽出されたMS提案を承認/編集/却下するUI
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Flag, Check, X, ChevronDown, ChevronRight, Loader2, Sparkles } from 'lucide-react';

interface MilestoneSuggestion {
  id: string;
  project_id: string;
  meeting_record_id: string | null;
  title: string;
  description: string | null;
  success_criteria: string | null;
  target_date: string | null;
  priority: string;
  related_task_titles: string[];
  status: string;
  created_at: string;
}

interface MilestoneProposalPanelProps {
  projectId: string;
  refreshKey?: number;
  onAccepted?: () => void;
}

export default function MilestoneProposalPanel({
  projectId,
  refreshKey = 0,
  onAccepted,
}: MilestoneProposalPanelProps) {
  const [suggestions, setSuggestions] = useState<MilestoneSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<MilestoneSuggestion>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/milestone-suggestions/pending?project_id=${projectId}`);
      const data = await res.json();
      if (data.success) {
        setSuggestions(data.data || []);
      }
    } catch { /* ignore */ }
    finally { setIsLoading(false); }
  }, [projectId]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions, refreshKey]);

  // 承認
  const handleAccept = async (suggestion: MilestoneSuggestion) => {
    setProcessingId(suggestion.id);
    try {
      const body: Record<string, unknown> = { status: 'accepted' };
      // 編集中のデータがあれば送信
      if (editingId === suggestion.id && editData) {
        if (editData.title) body.title = editData.title;
        if (editData.target_date) body.target_date = editData.target_date;
        if (editData.description) body.description = editData.description;
      }

      const res = await fetch(`/api/milestone-suggestions/${suggestion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
        setEditingId(null);
        setEditData({});
        onAccepted?.();
      }
    } catch { /* ignore */ }
    finally { setProcessingId(null); }
  };

  // 却下
  const handleDismiss = async (id: string) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/milestone-suggestions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed' }),
      });
      const data = await res.json();
      if (data.success) {
        setSuggestions((prev) => prev.filter((s) => s.id !== id));
      }
    } catch { /* ignore */ }
    finally { setProcessingId(null); }
  };

  // 表示なし
  if (!isLoading && suggestions.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-t-lg border border-blue-200">
        <Sparkles className="w-4 h-4 text-blue-500" />
        <span className="text-xs font-medium text-blue-700">
          マイルストーン提案
        </span>
        <span className="text-[10px] text-blue-400 ml-auto">
          {suggestions.length}件
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-4 border-x border-b border-blue-200 rounded-b-lg">
          <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
        </div>
      ) : (
        <div className="border-x border-b border-blue-200 rounded-b-lg divide-y divide-blue-100">
          {suggestions.map((suggestion) => {
            const isExpanded = expandedId === suggestion.id;
            const isEditing = editingId === suggestion.id;
            const isProcessing = processingId === suggestion.id;

            return (
              <div key={suggestion.id} className="px-3 py-2.5">
                {/* メイン行 */}
                <div className="flex items-start gap-2">
                  <Flag className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />

                  <div className="flex-1 min-w-0">
                    {/* タイトル */}
                    {isEditing ? (
                      <input
                        type="text"
                        value={editData.title ?? suggestion.title}
                        onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                        className="w-full text-xs font-medium border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setExpandedId(isExpanded ? null : suggestion.id);
                        }}
                        className="flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-blue-600 transition-colors text-left"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3 h-3 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3 h-3 shrink-0" />
                        )}
                        {suggestion.title}
                      </button>
                    )}

                    {/* メタ情報 */}
                    <div className="flex items-center gap-2 mt-1">
                      {isEditing ? (
                        <input
                          type="date"
                          value={editData.target_date ?? suggestion.target_date ?? ''}
                          onChange={(e) => setEditData({ ...editData, target_date: e.target.value })}
                          className="text-[10px] border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      ) : (
                        <>
                          {suggestion.target_date && (
                            <span className="text-[10px] text-slate-400">
                              期限: {new Date(suggestion.target_date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                          {suggestion.priority === 'high' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">高</span>
                          )}
                          {suggestion.related_task_titles?.length > 0 && (
                            <span className="text-[10px] text-slate-400">
                              関連タスク: {suggestion.related_task_titles.length}件
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {/* 展開時の詳細 */}
                    {isExpanded && !isEditing && (
                      <div className="mt-2 pl-1 space-y-1.5">
                        {suggestion.description && (
                          <p className="text-[11px] text-slate-500">{suggestion.description}</p>
                        )}
                        {suggestion.success_criteria && (
                          <div className="text-[11px]">
                            <span className="font-medium text-slate-600">達成条件: </span>
                            <span className="text-slate-500">{suggestion.success_criteria}</span>
                          </div>
                        )}
                        {suggestion.related_task_titles?.length > 0 && (
                          <div className="text-[11px]">
                            <span className="font-medium text-slate-600">関連タスク: </span>
                            <span className="text-slate-500">
                              {suggestion.related_task_titles.join('、')}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* アクションボタン */}
                  <div className="flex items-center gap-1 shrink-0">
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => handleAccept(suggestion)}
                          disabled={isProcessing}
                          className="px-2 py-1 text-[10px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : '承認'}
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setEditData({}); }}
                          className="px-2 py-1 text-[10px] text-slate-500 hover:text-slate-700 transition-colors"
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditingId(suggestion.id);
                            setEditData({
                              title: suggestion.title,
                              target_date: suggestion.target_date,
                            });
                          }}
                          className="p-1 text-slate-400 hover:text-blue-500 transition-colors"
                          title="編集して承認"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleAccept(suggestion)}
                          disabled={isProcessing}
                          className="p-1 text-green-500 hover:text-green-700 disabled:opacity-50 transition-colors"
                          title="承認"
                        >
                          {isProcessing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDismiss(suggestion.id)}
                          disabled={isProcessing}
                          className="p-1 text-slate-300 hover:text-red-500 disabled:opacity-50 transition-colors"
                          title="却下"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
