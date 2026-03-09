// V2-E: 検討ツリー全体ビューコンポーネント
'use client';

import { useState, useEffect, useCallback } from 'react';
import { GitBranch, Loader2, RefreshCw, TreePine } from 'lucide-react';
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

export default function DecisionTreeView({ projectId, refreshKey = 0 }: DecisionTreeViewProps) {
  const [tree, setTree] = useState<DecisionTree | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<DecisionTreeNodeData | null>(null);
  const [meetingRecords, setMeetingRecords] = useState<MeetingRecord[]>([]);

  const fetchTree = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // まずツリー一覧を取得
      const listRes = await fetch(`/api/decision-trees?project_id=${projectId}`);
      const listData = await listRes.json();

      if (!listData.success || !listData.data || listData.data.length === 0) {
        setTree(null);
        setIsLoading(false);
        return;
      }

      // 最初のツリーの詳細を取得
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

  useEffect(() => {
    fetchTree();
    fetchMeetingRecords();
  }, [fetchTree, fetchMeetingRecords, refreshKey]);

  const handleNodeClick = (node: DecisionTreeNodeData) => {
    setSelectedNode(node);
  };

  const handleDeleteNode = async (nodeId: string) => {
    try {
      const res = await fetch(`/api/decision-tree-nodes/${nodeId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setSelectedNode(null);
        fetchTree(); // リフレッシュ
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
        fetchTree(); // リフレッシュ
        // 選択中のノードも更新
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

  return (
    <div className="flex h-full">
      {/* ツリー表示 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">{tree.title}</h3>
            <span className="text-[10px] text-slate-400">
              {countNodes(tree.nodes)}ノード
            </span>
          </div>
          <button
            onClick={() => fetchTree()}
            className="p-1.5 hover:bg-slate-100 rounded transition-colors"
            title="更新"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>

        <div className="border border-slate-200 rounded-lg bg-white p-2">
          {tree.nodes.map((node) => (
            <DecisionTreeNode
              key={node.id}
              node={node}
              depth={0}
              onNodeClick={handleNodeClick}
              selectedNodeId={selectedNode?.id || null}
            />
          ))}
        </div>
      </div>

      {/* ノード詳細パネル */}
      {selectedNode && (
        <NodeDetailPanel
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
          onDelete={handleDeleteNode}
          onStatusChange={handleStatusChange}
          meetingRecords={meetingRecords}
        />
      )}
    </div>
  );
}

// ノード数をカウントするヘルパー
function countNodes(nodes: DecisionTreeNodeData[]): number {
  let count = 0;
  for (const node of nodes) {
    count += 1;
    if (node.children) {
      count += countNodes(node.children);
    }
  }
  return count;
}
