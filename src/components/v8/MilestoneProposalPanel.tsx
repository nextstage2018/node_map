// v8.0: 自動登録マイルストーン管理パネル（検討ツリータブに配置）
// 会議録AI解析から自動登録されたMSを編集/削除するUI
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Flag, ChevronDown, ChevronRight, Loader2, Sparkles, Trash2 } from 'lucide-react';

interface AutoMilestone {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  success_criteria: string | null;
  due_date: string | null;
  status: string;
  auto_generated: boolean;
  source_meeting_record_id: string | null;
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
  const [milestones, setMilestones] = useState<AutoMilestone[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<AutoMilestone>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchMilestones = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/milestone-suggestions/pending?project_id=${projectId}`);
      const data = await res.json();
      if (data.success) {
        setMilestones(data.data || []);
      }
    } catch { /* ignore */ }
    finally { setIsLoading(false); }
  }, [projectId]);

  useEffect(() => {
    fetchMilestones();
  }, [fetchMilestones, refreshKey]);

  // 編集保存
  const handleSave = async (milestone: AutoMilestone) => {
    setProcessingId(milestone.id);
    try {
      const body: Record<string, unknown> = {};
      if (editData.title) body.title = editData.title;
      if (editData.target_date !== undefined) body.target_date = editData.target_date;
      if (editData.description !== undefined) body.description = editData.description;
      if (editData.success_criteria !== undefined) body.success_criteria = editData.success_criteria;

      const res = await fetch(`/api/milestones/${milestone.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        // ローカル更新
        setMilestones((prev) =>
          prev.map((m) =>
            m.id === milestone.id
              ? {
                  ...m,
                  title: (editData.title ?? m.title),
                  description: (editData.description ?? m.description),
                  success_criteria: (editData.success_criteria ?? m.success_criteria),
                  due_date: (editData.target_date ?? m.due_date),
                }
              : m
          )
        );
        setEditingId(null);
        setEditData({});
        onAccepted?.();
      }
    } catch { /* ignore */ }
    finally { setProcessingId(null); }
  };

  // 削除
  const handleDelete = async (id: string) => {
    if (!confirm('このマイルストーンを削除しますか？')) return;
    setProcessingId(id);
    try {
      const res = await fetch(`/api/milestones/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setMilestones((prev) => prev.filter((m) => m.id !== id));
        onAccepted?.();
      }
    } catch { /* ignore */ }
    finally { setProcessingId(null); }
  };

  // 表示なし
  if (!isLoading && milestones.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-t-lg border border-blue-200">
        <Sparkles className="w-4 h-4 text-blue-500" />
        <span className="text-xs font-medium text-blue-700">
          自動登録マイルストーン
        </span>
        <span className="text-[10px] text-blue-400 ml-auto">
          {milestones.length}件
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-4 border-x border-b border-blue-200 rounded-b-lg">
          <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
        </div>
      ) : (
        <div className="border-x border-b border-blue-200 rounded-b-lg divide-y divide-blue-100">
          {milestones.map((milestone) => {
            const isExpanded = expandedId === milestone.id;
            const isEditing = editingId === milestone.id;
            const isProcessing = processingId === milestone.id;

            return (
              <div key={milestone.id} className="px-3 py-2.5">
                {/* メイン行 */}
                <div className="flex items-start gap-2">
                  <Flag className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />

                  <div className="flex-1 min-w-0">
                    {/* 編集モード */}
                    {isEditing ? (
                      <div className="space-y-2">
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">タイトル</label>
                          <input
                            type="text"
                            value={editData.title ?? milestone.title}
                            onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                            className="w-full text-xs font-medium border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">到達条件・ゴール</label>
                          <textarea
                            value={editData.description ?? milestone.description ?? ''}
                            onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                            rows={2}
                            className="w-full text-[11px] border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                            placeholder="到達条件を記載"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">達成条件</label>
                          <textarea
                            value={editData.success_criteria ?? milestone.success_criteria ?? ''}
                            onChange={(e) => setEditData({ ...editData, success_criteria: e.target.value })}
                            rows={2}
                            className="w-full text-[11px] border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                            placeholder="達成条件を記載"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">期限</label>
                          <input
                            type="date"
                            value={editData.target_date ?? milestone.target_date ?? ''}
                            onChange={(e) => setEditData({ ...editData, due_date: e.target.value })}
                            className="text-[11px] border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setExpandedId(isExpanded ? null : milestone.id);
                        }}
                        className="flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-blue-600 transition-colors text-left"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3 h-3 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3 h-3 shrink-0" />
                        )}
                        {milestone.title}
                      </button>
                    )}

                    {/* メタ情報（非編集時のみ） */}
                    {!isEditing && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">
                          AI自動登録
                        </span>
                        {milestone.target_date && (
                          <span className="text-[10px] text-slate-400">
                            期限: {new Date(milestone.target_date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                        {milestone.status === 'in_progress' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-600">進行中</span>
                        )}
                      </div>
                    )}

                    {/* 展開時の詳細 */}
                    {isExpanded && !isEditing && (
                      <div className="mt-2 pl-1 space-y-1.5">
                        {milestone.description && (
                          <p className="text-[11px] text-slate-500">{milestone.description}</p>
                        )}
                        {milestone.success_criteria && (
                          <div className="text-[11px]">
                            <span className="font-medium text-slate-600">達成条件: </span>
                            <span className="text-slate-500">{milestone.success_criteria}</span>
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
                          onClick={() => handleSave(milestone)}
                          disabled={isProcessing}
                          className="px-2 py-1 text-[10px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : '保存'}
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
                            setEditingId(milestone.id);
                            setEditData({
                              title: milestone.title,
                              due_date: milestone.target_date,
                              description: milestone.description,
                              success_criteria: milestone.success_criteria,
                            });
                            setExpandedId(null);
                          }}
                          className="p-1 text-slate-400 hover:text-blue-500 transition-colors"
                          title="編集"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(milestone.id)}
                          disabled={isProcessing}
                          className="p-1 text-slate-300 hover:text-red-500 disabled:opacity-50 transition-colors"
                          title="削除"
                        >
                          {isProcessing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
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
