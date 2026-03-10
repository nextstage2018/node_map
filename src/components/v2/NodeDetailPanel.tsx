// V2-E: ノード詳細スライドパネル
'use client';

import { useState, useEffect } from 'react';
import { X, Clock, FileText, Trash2, MoreHorizontal, AlertCircle, CircleDot, CheckCircle2, ArrowRight } from 'lucide-react';
import type { DecisionTreeNodeData } from './DecisionTreeNode';

interface OpenIssue {
  id: string;
  title: string;
  status: 'open' | 'resolved' | 'stale';
  priority_level: 'low' | 'medium' | 'high' | 'critical';
  days_stagnant: number;
  created_at: string;
}

interface DecisionLogEntry {
  id: string;
  title: string;
  decision_content: string;
  status: 'active' | 'superseded' | 'reverted' | 'on_hold';
  previous_decision_id: string | null;
  created_at: string;
}

interface NodeHistory {
  id: string;
  node_id: string;
  previous_status: string | null;
  new_status: string;
  reason: string | null;
  meeting_record_id: string | null;
  changed_at: string;
}

interface NodeDetailPanelProps {
  node: DecisionTreeNodeData;
  projectId: string;
  onClose: () => void;
  onDelete: (nodeId: string) => void;
  onStatusChange: (nodeId: string, newStatus: string, reason?: string) => void;
  meetingRecords?: Array<{ id: string; title: string; meeting_date: string }>;
}

const statusLabels: Record<string, string> = {
  active: '有効',
  completed: '完了',
  cancelled: '取消',
  on_hold: '保留',
};

const statusColors: Record<string, string> = {
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  on_hold: 'bg-slate-100 text-slate-600',
};

const priorityColors: Record<string, string> = {
  low: 'text-slate-500',
  medium: 'text-blue-600',
  high: 'text-amber-600',
  critical: 'text-red-600',
};

const priorityLabels: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '緊急',
};

const decisionStatusLabels: Record<string, string> = {
  active: '有効',
  superseded: '変更済',
  reverted: '差戻',
  on_hold: '保留',
};

const decisionStatusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  superseded: 'bg-slate-100 text-slate-500',
  reverted: 'bg-amber-100 text-amber-700',
  on_hold: 'bg-slate-100 text-slate-600',
};

export default function NodeDetailPanel({
  node,
  projectId,
  onClose,
  onDelete,
  onStatusChange,
  meetingRecords = [],
}: NodeDetailPanelProps) {
  const [history, setHistory] = useState<NodeHistory[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [openIssues, setOpenIssues] = useState<OpenIssue[]>([]);
  const [decisionLogs, setDecisionLogs] = useState<DecisionLogEntry[]>([]);
  const [isLoadingV34, setIsLoadingV34] = useState(false);

  // ノード詳細（履歴含む）を取得
  useEffect(() => {
    const fetchDetail = async () => {
      setIsLoadingHistory(true);
      try {
        const res = await fetch(`/api/decision-tree-nodes/${node.id}`);
        const data = await res.json();
        if (data.success && data.data.history) {
          setHistory(data.data.history);
        }
      } catch (err) {
        console.error('ノード詳細取得エラー:', err);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    fetchDetail();
  }, [node.id]);

  // v3.4: 関連する未確定事項・決定ログを取得
  useEffect(() => {
    if (!projectId) return;
    const fetchV34Data = async () => {
      setIsLoadingV34(true);
      try {
        const [issuesRes, decisionsRes] = await Promise.all([
          fetch(`/api/projects/${projectId}/open-issues?node_id=${node.id}`),
          fetch(`/api/projects/${projectId}/decision-log?node_id=${node.id}`),
        ]);
        const issuesData = await issuesRes.json();
        const decisionsData = await decisionsRes.json();
        if (issuesData.success) setOpenIssues(issuesData.data || []);
        if (decisionsData.success) setDecisionLogs(decisionsData.data || []);
      } catch (err) {
        console.error('v3.4データ取得エラー:', err);
      } finally {
        setIsLoadingV34(false);
      }
    };
    fetchV34Data();
  }, [projectId, node.id]);

  const sourceMeeting = meetingRecords.find(m => m.id === node.source_meeting_id);
  const cancelMeeting = meetingRecords.find(m => m.id === node.cancel_meeting_id);

  const getMeetingTitle = (meetingId: string | null) => {
    if (!meetingId) return null;
    const meeting = meetingRecords.find(m => m.id === meetingId);
    return meeting ? `${meeting.title}（${new Date(meeting.meeting_date).toLocaleDateString('ja-JP')}）` : meetingId;
  };

  return (
    <div className="border-l border-slate-200 bg-white w-80 flex flex-col h-full overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <h3 className="text-sm font-bold text-slate-800 truncate flex-1">{node.title}</h3>
        <div className="flex items-center gap-1">
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 hover:bg-slate-100 rounded"
            >
              <MoreHorizontal className="w-4 h-4 text-slate-500" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-10 min-w-[120px]">
                {node.status !== 'completed' && (
                  <button
                    onClick={() => { onStatusChange(node.id, 'completed'); setShowMenu(false); }}
                    className="w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                  >
                    完了にする
                  </button>
                )}
                {node.status !== 'cancelled' && (
                  <button
                    onClick={() => { onStatusChange(node.id, 'cancelled', '手動で取消'); setShowMenu(false); }}
                    className="w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                  >
                    取消にする
                  </button>
                )}
                {node.status !== 'on_hold' && (
                  <button
                    onClick={() => { onStatusChange(node.id, 'on_hold'); setShowMenu(false); }}
                    className="w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                  >
                    保留にする
                  </button>
                )}
                {node.status !== 'active' && (
                  <button
                    onClick={() => { onStatusChange(node.id, 'active'); setShowMenu(false); }}
                    className="w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                  >
                    有効に戻す
                  </button>
                )}
                <hr className="my-1 border-slate-100" />
                <button
                  onClick={() => { setShowDeleteConfirm(true); setShowMenu(false); }}
                  className="w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                >
                  削除
                </button>
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ステータス */}
        <div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColors[node.status]}`}>
            {statusLabels[node.status]}
          </span>
        </div>

        {/* 説明 */}
        {node.description && (
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">説明</p>
            <p className="text-sm text-slate-700">{node.description}</p>
          </div>
        )}

        {/* 作成元の会議 */}
        {sourceMeeting && (
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">作成元</p>
            <div className="flex items-center gap-1.5 text-sm text-slate-700">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>{sourceMeeting.title}（{new Date(sourceMeeting.meeting_date).toLocaleDateString('ja-JP')}）</span>
            </div>
          </div>
        )}

        {/* 取消情報 */}
        {node.status === 'cancelled' && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertCircle className="w-3.5 h-3.5 text-red-500" />
              <span className="text-xs font-medium text-red-700">取消</span>
            </div>
            {node.cancel_reason && (
              <p className="text-xs text-red-600 mb-1">理由: {node.cancel_reason}</p>
            )}
            {cancelMeeting && (
              <p className="text-xs text-red-600">
                会議: {cancelMeeting.title}（{new Date(cancelMeeting.meeting_date).toLocaleDateString('ja-JP')}）
              </p>
            )}
          </div>
        )}

        {/* v3.4: 関連する未確定事項 */}
        {isLoadingV34 ? (
          <div className="text-xs text-slate-400 py-1">関連データを読み込み中...</div>
        ) : (
          <>
            {openIssues.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">未確定事項</p>
                <div className="space-y-1.5">
                  {openIssues.map((issue) => (
                    <div key={issue.id} className="p-2 bg-slate-50 border border-slate-100 rounded-lg">
                      <div className="flex items-start gap-1.5">
                        <CircleDot className={`w-3 h-3 mt-0.5 shrink-0 ${issue.status === 'stale' ? 'text-amber-500' : 'text-blue-500'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-700 font-medium truncate">{issue.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[10px] font-medium ${priorityColors[issue.priority_level]}`}>
                              {priorityLabels[issue.priority_level]}
                            </span>
                            {issue.days_stagnant > 0 && (
                              <span className="text-[10px] text-slate-400">{issue.days_stagnant}日経過</span>
                            )}
                            {issue.status === 'stale' && (
                              <span className="text-[10px] px-1 py-0.5 bg-amber-100 text-amber-600 rounded">停滞</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {decisionLogs.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">決定履歴</p>
                <div className="space-y-1.5">
                  {decisionLogs.map((decision) => (
                    <div key={decision.id} className="p-2 bg-slate-50 border border-slate-100 rounded-lg">
                      <div className="flex items-start gap-1.5">
                        <CheckCircle2 className={`w-3 h-3 mt-0.5 shrink-0 ${decision.status === 'active' ? 'text-green-500' : 'text-slate-400'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs text-slate-700 font-medium truncate flex-1">{decision.title}</p>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${decisionStatusColors[decision.status]}`}>
                              {decisionStatusLabels[decision.status]}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{decision.decision_content}</p>
                          {decision.previous_decision_id && (
                            <div className="flex items-center gap-0.5 mt-0.5">
                              <ArrowRight className="w-2.5 h-2.5 text-slate-300" />
                              <span className="text-[10px] text-slate-400">変更チェーン</span>
                            </div>
                          )}
                          <p className="text-[10px] text-slate-300 mt-0.5">
                            {new Date(decision.created_at).toLocaleDateString('ja-JP')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* 変更履歴 */}
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">変更履歴</p>
          {isLoadingHistory ? (
            <div className="text-xs text-slate-400 py-2">読み込み中...</div>
          ) : history.length === 0 ? (
            <div className="text-xs text-slate-400 py-2">履歴なし</div>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="flex gap-2 text-xs">
                  <Clock className="w-3 h-3 text-slate-300 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-slate-600">
                      {h.previous_status ? (
                        <span>{statusLabels[h.previous_status] || h.previous_status} → {statusLabels[h.new_status] || h.new_status}</span>
                      ) : (
                        <span>{statusLabels[h.new_status] || h.new_status}（新規作成）</span>
                      )}
                    </div>
                    {h.reason && <div className="text-slate-400">{h.reason}</div>}
                    {h.meeting_record_id && (
                      <div className="text-slate-400">{getMeetingTitle(h.meeting_record_id)}</div>
                    )}
                    <div className="text-slate-300">
                      {new Date(h.changed_at).toLocaleString('ja-JP')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 削除確認 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-5 shadow-xl max-w-sm mx-4">
            <h4 className="text-sm font-bold text-slate-800 mb-2">ノードを削除しますか？</h4>
            <p className="text-xs text-slate-500 mb-4">
              「{node.title}」とその子ノードが全て削除されます。この操作は取り消せません。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                キャンセル
              </button>
              <button
                onClick={() => { onDelete(node.id); setShowDeleteConfirm(false); }}
                className="px-3 py-1.5 text-xs text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                削除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
