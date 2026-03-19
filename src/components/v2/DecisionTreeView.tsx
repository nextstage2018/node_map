// V2-E: 検討ツリー マインドマップビューコンポーネント
// P1-1: 会議日付ごとにセクション分け + 折りたたみ表示
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { GitBranch, Loader2, RefreshCw, TreePine, Maximize2, Minimize2, Calendar, ChevronDown, ChevronRight } from 'lucide-react';
import DecisionTreeNode, { type DecisionTreeNodeData } from './DecisionTreeNode';
import NodeDetailPanel from './NodeDetailPanel';

interface DecisionTree {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  nodes: DecisionTreeNodeData[];
}

interface MeetingRecord {
  id: string;
  title: string;
  meeting_date: string;
  ai_summary: string | null;
}

interface DecisionTreeViewProps {
  projectId: string;
  refreshKey?: number;
}

// 会議ごとのノードグループ
interface MeetingNodeGroup {
  meetingId: string | null;
  meetingTitle: string;
  meetingDate: string;
  nodes: DecisionTreeNodeData[];
}

export default function DecisionTreeView({ projectId, refreshKey = 0 }: DecisionTreeViewProps) {
  const [tree, setTree] = useState<DecisionTree | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<DecisionTreeNodeData | null>(null);
  const [meetingRecords, setMeetingRecords] = useState<MeetingRecord[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // v3.4: ノード別の未確定事項・決定ログ件数
  const [nodeIssueCounts, setNodeIssueCounts] = useState<Record<string, number>>({});
  const [nodeDecisionCounts, setNodeDecisionCounts] = useState<Record<string, number>>({});
  // P1-1: セクション折りたたみ状態（キー: meetingId or 'no-meeting'）
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const fetchTree = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const listRes = await fetch(`/api/decision-trees?project_id=${projectId}`);
      const listData = await listRes.json();

      if (!listData.success || !listData.data || listData.data.length === 0) {
        setTree(null);
        setIsLoading(false);
        return;
      }

      const treeId = listData.data[0].id;
      const detailRes = await fetch(`/api/decision-trees/${treeId}`);
      const detailData = await detailRes.json();

      if (detailData.success) {
        setTree(detailData.data);
      } else {
        setError(detailData.error || 'ツリーの取得に失敗しました');
      }
    } catch (err) {
      console.error('検討ツリー取得エラー:', err);
      setError('検討ツリーの取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const fetchMeetingRecords = useCallback(async () => {
    try {
      const res = await fetch(`/api/meeting-records?project_id=${projectId}`);
      const data = await res.json();
      if (data.success) {
        setMeetingRecords(data.data || []);
      }
    } catch (err) {
      console.error('会議録取得エラー:', err);
    }
  }, [projectId]);

  // v3.4: プロジェクト全体の未確定事項・決定ログを取得してノード別にカウント
  const fetchV34Counts = useCallback(async () => {
    try {
      const [issuesRes, decisionsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/open-issues`),
        fetch(`/api/projects/${projectId}/decision-log`),
      ]);
      const issuesData = await issuesRes.json();
      const decisionsData = await decisionsRes.json();

      if (issuesData.success && issuesData.data) {
        const counts: Record<string, number> = {};
        for (const issue of issuesData.data) {
          if (issue.related_decision_node_id) {
            counts[issue.related_decision_node_id] = (counts[issue.related_decision_node_id] || 0) + 1;
          }
        }
        setNodeIssueCounts(counts);
      }

      if (decisionsData.success && decisionsData.data) {
        const counts: Record<string, number> = {};
        for (const d of decisionsData.data) {
          if (d.decision_tree_node_id) {
            counts[d.decision_tree_node_id] = (counts[d.decision_tree_node_id] || 0) + 1;
          }
        }
        setNodeDecisionCounts(counts);
      }
    } catch (err) {
      console.error('v3.4カウント取得エラー:', err);
    }
  }, [projectId]);

  useEffect(() => {
    fetchTree();
    fetchMeetingRecords();
    fetchV34Counts();
  }, [fetchTree, fetchMeetingRecords, fetchV34Counts, refreshKey]);

  // P1-1: ノードを会議録ごとにグループ化（最新が上）
  const meetingNodeGroups: MeetingNodeGroup[] = useMemo(() => {
    if (!tree || tree.nodes.length === 0) return [];

    // 会議録IDのマップを作成
    const meetingMap = new Map<string, MeetingRecord>();
    for (const mr of meetingRecords) {
      meetingMap.set(mr.id, mr);
    }

    // ルートノード（topic）の source_meeting_id でグループ化
    const groups = new Map<string, DecisionTreeNodeData[]>();

    for (const rootNode of tree.nodes) {
      const key = rootNode.source_meeting_id || '__no_meeting__';
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(rootNode);
    }

    // グループを会議日付の降順でソート（最新が上）
    const result: MeetingNodeGroup[] = [];
    for (const [key, nodes] of groups) {
      if (key === '__no_meeting__') {
        result.push({
          meetingId: null,
          meetingTitle: '手動追加・その他',
          meetingDate: '',
          nodes,
        });
      } else {
        const mr = meetingMap.get(key);
        result.push({
          meetingId: key,
          meetingTitle: mr?.title || '会議録',
          meetingDate: mr?.meeting_date || '',
          nodes,
        });
      }
    }

    // 日付降順ソート（最新が上、日付なしは最後）
    result.sort((a, b) => {
      if (!a.meetingDate && !b.meetingDate) return 0;
      if (!a.meetingDate) return 1;
      if (!b.meetingDate) return -1;
      return b.meetingDate.localeCompare(a.meetingDate);
    });

    return result;
  }, [tree, meetingRecords]);

  // P1-1: 初回読み込み時、最新以外を折りたたむ
  useEffect(() => {
    if (meetingNodeGroups.length > 1) {
      const toCollapse = new Set<string>();
      // 最初のグループ（最新）以外を折りたたむ
      for (let i = 1; i < meetingNodeGroups.length; i++) {
        const key = meetingNodeGroups[i].meetingId || '__no_meeting__';
        toCollapse.add(key);
      }
      setCollapsedSections(toCollapse);
    }
  }, [meetingNodeGroups.length]); // グループ数が変わったときだけ

  const handleNodeClick = (node: DecisionTreeNodeData) => {
    setSelectedNode(node);
  };

  const handleDeleteNode = async (nodeId: string) => {
    try {
      const res = await fetch(`/api/decision-tree-nodes/${nodeId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setSelectedNode(null);
        fetchTree();
      } else {
        alert(data.error || '削除に失敗しました');
      }
    } catch (err) {
      console.error('ノード削除エラー:', err);
      alert('削除に失敗しました');
    }
  };

  const handleStatusChange = async (nodeId: string, newStatus: string, reason?: string) => {
    try {
      const res = await fetch(`/api/decision-tree-nodes/${nodeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          cancel_reason: reason || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchTree();
        if (selectedNode && selectedNode.id === nodeId) {
          setSelectedNode({ ...selectedNode, status: newStatus as DecisionTreeNodeData['status'] });
        }
      } else {
        alert(data.error || 'ステータス変更に失敗しました');
      }
    } catch (err) {
      console.error('ステータス変更エラー:', err);
      alert('ステータス変更に失敗しました');
    }
  };

  const toggleSection = (sectionKey: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  };

  const expandAll = () => setCollapsedSections(new Set());
  const collapseAll = () => {
    const all = new Set<string>();
    for (const g of meetingNodeGroups) {
      all.add(g.meetingId || '__no_meeting__');
    }
    setCollapsedSections(all);
  };

  // ステータス別のサマリーを計算
  const getStatusSummary = (nodes: DecisionTreeNodeData[]): Record<string, number> => {
    const summary: Record<string, number> = { active: 0, completed: 0, cancelled: 0, on_hold: 0 };
    const count = (nodeList: DecisionTreeNodeData[]) => {
      for (const n of nodeList) {
        summary[n.status] = (summary[n.status] || 0) + 1;
        if (n.children) count(n.children);
      }
    };
    count(nodes);
    return summary;
  };

  // セクション内のノード数を計算（子含む）
  const countAllNodes = (nodes: DecisionTreeNodeData[]): number => {
    let c = 0;
    const walk = (ns: DecisionTreeNodeData[]) => {
      for (const n of ns) {
        c++;
        if (n.children) walk(n.children);
      }
    };
    walk(nodes);
    return c;
  };

  // 日付をフォーマット
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
    } catch {
      return dateStr;
    }
  };

  // ローディング
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  // エラー
  if (error) {
    return (
      <div className="px-4 py-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
        {error}
      </div>
    );
  }

  // ツリーなし
  if (!tree || tree.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <TreePine className="w-10 h-10 mb-3 text-slate-300" />
        <p className="text-sm mb-1">検討ツリーはまだありません</p>
        <p className="text-xs">会議録をアップロードしてAI解析を行うと、自動で検討ツリーが生成されます</p>
      </div>
    );
  }

  const allNodes = tree.nodes;
  const statusSummary = getStatusSummary(allNodes);
  const totalNodes = Object.values(statusSummary).reduce((a, b) => a + b, 0);

  const containerClass = isFullscreen
    ? 'fixed inset-0 z-50 bg-white flex flex-col'
    : '';

  return (
    <div className={containerClass}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-bold text-slate-800">{tree.title}</h3>
          <span className="text-[10px] text-slate-400">{totalNodes}ノード・{meetingNodeGroups.length}回の会議</span>
        </div>
        <div className="flex items-center gap-3">
          {/* ステータスサマリー */}
          <div className="flex items-center gap-2">
            {statusSummary.active > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-blue-600">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                進行中 {statusSummary.active}
              </span>
            )}
            {statusSummary.completed > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-green-600">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                完了 {statusSummary.completed}
              </span>
            )}
            {statusSummary.cancelled > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-slate-400">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                取消 {statusSummary.cancelled}
              </span>
            )}
            {statusSummary.on_hold > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-amber-500">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                保留 {statusSummary.on_hold}
              </span>
            )}
          </div>
          {/* 全開/全閉ボタン */}
          {meetingNodeGroups.length > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={expandAll}
                className="px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100 rounded transition-colors"
                title="すべて展開"
              >
                全開
              </button>
              <button
                onClick={collapseAll}
                className="px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100 rounded transition-colors"
                title="すべて折りたたみ"
              >
                全閉
              </button>
            </div>
          )}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 hover:bg-slate-100 rounded transition-colors"
            title={isFullscreen ? '縮小' : '全画面'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>
          <button
            onClick={() => fetchTree()}
            className="p-1.5 hover:bg-slate-100 rounded transition-colors"
            title="更新"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </div>

      {/* メインエリア */}
      <div className="flex flex-1 min-h-0">
        <div
          className={`
            flex-1 border border-slate-200 rounded-lg bg-gradient-to-br from-slate-50 to-white
            overflow-auto relative
            ${isFullscreen ? 'p-6' : 'p-4'}
          `}
          style={{ minHeight: isFullscreen ? undefined : '300px' }}
        >
          {/* 会議日付ごとのセクション */}
          <div className="flex flex-col gap-3">
            {meetingNodeGroups.map((group, groupIdx) => {
              const sectionKey = group.meetingId || '__no_meeting__';
              const isCollapsed = collapsedSections.has(sectionKey);
              const sectionNodeCount = countAllNodes(group.nodes);
              const sectionStatus = getStatusSummary(group.nodes);
              const isLatest = groupIdx === 0;

              return (
                <div
                  key={sectionKey}
                  className={`
                    border rounded-lg overflow-hidden transition-colors
                    ${isLatest ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200 bg-white'}
                  `}
                >
                  {/* セクションヘッダー（クリックで折りたたみ） */}
                  <button
                    onClick={() => toggleSection(sectionKey)}
                    className={`
                      w-full flex items-center gap-2 px-3 py-2 text-left
                      hover:bg-slate-50 transition-colors
                      ${isLatest ? 'hover:bg-blue-50' : ''}
                    `}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    )}
                    <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    {group.meetingDate && (
                      <span className="text-xs font-medium text-slate-600">
                        {formatDate(group.meetingDate)}
                      </span>
                    )}
                    <span className={`text-xs truncate max-w-[300px] ${isLatest ? 'font-semibold text-blue-700' : 'text-slate-700'}`}>
                      {group.meetingTitle}
                    </span>
                    {isLatest && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium flex-shrink-0">
                        最新
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 flex-shrink-0 ml-auto">
                      {sectionNodeCount}ノード
                    </span>
                    {/* ミニステータス */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {sectionStatus.active > 0 && (
                        <span className="w-2 h-2 rounded-full bg-blue-400" title={`進行中 ${sectionStatus.active}`} />
                      )}
                      {sectionStatus.completed > 0 && (
                        <span className="w-2 h-2 rounded-full bg-green-400" title={`完了 ${sectionStatus.completed}`} />
                      )}
                      {sectionStatus.on_hold > 0 && (
                        <span className="w-2 h-2 rounded-full bg-amber-400" title={`保留 ${sectionStatus.on_hold}`} />
                      )}
                    </div>
                  </button>

                  {/* セクション内容（折りたたみ対象） */}
                  {!isCollapsed && (
                    <div className="px-3 pb-3 pt-1">
                      <div className="flex flex-col gap-3 min-w-max">
                        {group.nodes.map((rootNode) => (
                          <DecisionTreeNode
                            key={rootNode.id}
                            node={rootNode}
                            depth={0}
                            onNodeClick={handleNodeClick}
                            selectedNodeId={selectedNode?.id || null}
                            nodeIssueCounts={nodeIssueCounts}
                            nodeDecisionCounts={nodeDecisionCounts}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ノード詳細パネル */}
        {selectedNode && (
          <NodeDetailPanel
            node={selectedNode}
            projectId={projectId}
            onClose={() => setSelectedNode(null)}
            onDelete={handleDeleteNode}
            onStatusChange={handleStatusChange}
            meetingRecords={meetingRecords}
          />
        )}
      </div>

      {/* フルスクリーン時の閉じるヒント */}
      {isFullscreen && (
        <div className="text-center py-2 text-[10px] text-slate-400">
          ESCまたは右上ボタンで閉じる
        </div>
      )}
    </div>
  );
}
