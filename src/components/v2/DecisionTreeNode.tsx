// V2-E: 検討ツリー マインドマップノードコンポーネント
'use client';

import { useState } from 'react';
import { ChevronRight, Check, X, Pause, Minus } from 'lucide-react';

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

// ステータス別の設定
const statusStyles = {
  active: {
    bg: 'bg-white',
    border: 'border-blue-300',
    dot: 'bg-blue-500',
    text: 'text-slate-800',
    icon: null,
    line: 'bg-blue-200',
  },
  completed: {
    bg: 'bg-green-50',
    border: 'border-green-400',
    dot: 'bg-green-500',
    text: 'text-green-800',
    icon: Check,
    line: 'bg-green-200',
  },
  cancelled: {
    bg: 'bg-slate-50',
    border: 'border-slate-300',
    dot: 'bg-slate-400',
    text: 'text-slate-400 line-through',
    icon: X,
    line: 'bg-slate-200',
  },
  on_hold: {
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    dot: 'bg-amber-400',
    text: 'text-amber-700',
    icon: Pause,
    line: 'bg-amber-200',
  },
};

// ノードタイプ別のスタイル
const typeStyles = {
  topic: { label: '議題', badge: 'bg-blue-100 text-blue-700', size: 'px-3 py-2' },
  option: { label: '選択肢', badge: 'bg-slate-100 text-slate-600', size: 'px-2.5 py-1.5' },
  decision: { label: '決定', badge: 'bg-purple-100 text-purple-700', size: 'px-2.5 py-1.5' },
  action: { label: 'アクション', badge: 'bg-orange-100 text-orange-700', size: 'px-2.5 py-1.5' },
};

export default function DecisionTreeNode({ node, depth, onNodeClick, selectedNodeId }: DecisionTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const style = statusStyles[node.status] || statusStyles.active;
  const typeStyle = typeStyles[node.node_type] || typeStyles.option;
  const isSelected = selectedNodeId === node.id;
  const StatusIcon = style.icon;
  const isTopic = node.node_type === 'topic';

  return (
    <div className="flex items-start gap-0">
      {/* ノードカード */}
      <div className="flex flex-col items-center">
        <div
          onClick={() => onNodeClick(node)}
          className={`
            relative cursor-pointer rounded-lg border-2 transition-all
            ${style.bg} ${style.border}
            ${isSelected ? 'ring-2 ring-blue-400 ring-offset-1 shadow-md' : 'hover:shadow-sm'}
            ${isTopic ? 'min-w-[180px]' : 'min-w-[140px]'}
            ${typeStyle.size}
          `}
        >
          {/* ステータスドット/アイコン */}
          <div className="flex items-center gap-1.5">
            {StatusIcon ? (
              <span className={`w-4 h-4 rounded-full flex items-center justify-center ${style.dot}`}>
                <StatusIcon className="w-2.5 h-2.5 text-white" strokeWidth={3} />
              </span>
            ) : (
              <span className={`w-3 h-3 rounded-full ${style.dot}`} />
            )}
            <span className={`${isTopic ? 'text-sm font-bold' : 'text-xs font-medium'} ${style.text} leading-tight`}>
              {node.title}
            </span>
          </div>

          {/* ノードタイプバッジ */}
          <div className="mt-1">
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${typeStyle.badge}`}>
              {typeStyle.label}
            </span>
          </div>
        </div>
      </div>

      {/* 子ノードへの接続線 + 子ノード */}
      {hasChildren && (
        <div className="flex items-center gap-0 ml-0">
          {/* 横線 */}
          <div className="flex flex-col items-center">
            {/* トグルボタン付きの横線 */}
            <div className="flex items-center">
              <div className={`w-6 h-0.5 ${style.line}`} />
              {hasChildren && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(!isExpanded);
                  }}
                  className={`
                    w-5 h-5 rounded-full border-2 flex items-center justify-center
                    ${isExpanded ? 'border-slate-300 bg-white' : 'border-blue-400 bg-blue-50'}
                    hover:bg-slate-100 transition-colors z-10
                  `}
                >
                  {isExpanded ? (
                    <Minus className="w-2.5 h-2.5 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-2.5 h-2.5 text-blue-500" />
                  )}
                </button>
              )}
              {isExpanded && <div className={`w-4 h-0.5 ${style.line}`} />}
            </div>
          </div>

          {/* 子ノード（縦に並べる） */}
          {isExpanded && (
            <div className="flex flex-col gap-1.5 relative">
              {/* 縦の接続線 */}
              {node.children.length > 1 && (
                <div
                  className={`absolute left-0 top-3 w-0.5 ${style.line}`}
                  style={{
                    height: `calc(100% - 24px)`,
                  }}
                />
              )}
              {node.children.map((child, idx) => (
                <div key={child.id} className="flex items-center gap-0">
                  {/* 子への横線 */}
                  <div className={`w-4 h-0.5 ${style.line}`} />
                  <DecisionTreeNode
                    node={child}
                    depth={depth + 1}
                    onNodeClick={onNodeClick}
                    selectedNodeId={selectedNodeId}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
