// V2-E: 検討ツリー個別ノードコンポーネント
'use client';

import { ChevronRight, ChevronDown, Circle, CheckCircle, XCircle, PauseCircle } from 'lucide-react';
import { useState } from 'react';

export interface DecisionTreeNodeData {
  id: string;
  tree_id: string;
  parent_node_id: string | null;
  title: string;
  node_type: 'topic' | 'option' | 'decision' | 'action';
  status: 'active' | 'completed' | 'cancelled' | 'on_hold';
  description: string | null;
  cancel_reason: string | null;
  cancel_meeting_id: string | null;
  source_meeting_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  children: DecisionTreeNodeData[];
}

interface DecisionTreeNodeProps {
  node: DecisionTreeNodeData;
  depth: number;
  onNodeClick: (node: DecisionTreeNodeData) => void;
  selectedNodeId: string | null;
}

const statusConfig = {
  active: {
    icon: Circle,
    color: 'text-blue-500',
    textClass: '',
    label: '有効',
  },
  completed: {
    icon: CheckCircle,
    color: 'text-green-500',
    textClass: '',
    label: '完了',
  },
  cancelled: {
    icon: XCircle,
    color: 'text-red-400',
    textClass: 'line-through text-slate-400',
    label: '取消',
  },
  on_hold: {
    icon: PauseCircle,
    color: 'text-slate-400',
    textClass: 'text-slate-400',
    label: '保留',
  },
};

const nodeTypeLabels: Record<string, string> = {
  topic: '議題',
  option: '選択肢',
  decision: '決定',
  action: 'アクション',
};

export default function DecisionTreeNode({ node, depth, onNodeClick, selectedNodeId }: DecisionTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const config = statusConfig[node.status] || statusConfig.active;
  const StatusIcon = config.icon;
  const isSelected = selectedNodeId === node.id;

  return (
    <div>
      <div
        className={`
          flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer transition-colors
          ${isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50'}
        `}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => onNodeClick(node)}
      >
        {/* 展開/折りたたみ */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="p-0.5 hover:bg-slate-200 rounded"
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>
        ) : (
          <span className="w-4.5 inline-block" />
        )}

        {/* ステータスアイコン */}
        <StatusIcon className={`w-3.5 h-3.5 shrink-0 ${config.color}`} />

        {/* タイトル */}
        <span className={`text-sm flex-1 truncate ${config.textClass}`}>
          {node.title}
        </span>

        {/* ノードタイプバッジ */}
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">
          {nodeTypeLabels[node.node_type] || node.node_type}
        </span>
      </div>

      {/* 子ノード */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <DecisionTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onNodeClick={onNodeClick}
              selectedNodeId={selectedNodeId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
