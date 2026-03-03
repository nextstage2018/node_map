// Phase 57: 今週のタグクラウド
'use client';

import { useState, useEffect } from 'react';

interface WeekNode {
  id: string;
  label: string;
  frequency: number;
  relatedTaskIds: string[];
  relatedSeedIds: string[];
  category: string;
  color: string;
}

interface ThisWeekData {
  weekStart: string;
  weekEnd: string;
  nodes: WeekNode[];
}

export default function ThisWeekTagCloud() {
  const [data, setData] = useState<ThisWeekData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<WeekNode | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/nodes/this-week');
        const json = await res.json();
        if (json.success && json.data) {
          setData(json.data);
        }
      } catch (e) {
        console.error('[ThisWeekTagCloud] 取得エラー:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="animate-pulse flex items-center gap-2 mb-3">
          <div className="h-4 w-32 bg-slate-200 rounded" />
        </div>
        <div className="animate-pulse flex flex-wrap gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-6 w-16 bg-slate-100 rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
          <span className="text-base">📊</span> 今週のノード
        </h3>
        <p className="text-xs text-slate-400 py-4 text-center">
          まだ今週のキーワードが少ないです。タスクや種のAI会話を進めるとキーワードが蓄積されます。
        </p>
      </div>
    );
  }

  // frequencyの最大/最小を取得してフォントサイズ計算
  const maxFreq = Math.max(...data.nodes.map(n => n.frequency));
  const minFreq = Math.min(...data.nodes.map(n => n.frequency));

  const getFontSize = (freq: number): number => {
    if (maxFreq === minFreq) return 14;
    const ratio = (freq - minFreq) / (maxFreq - minFreq);
    return 11 + ratio * 14; // 11px ~ 25px
  };

  const weekStartStr = data.weekStart ? new Date(data.weekStart).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }) : '';
  const weekEndStr = data.weekEnd ? new Date(data.weekEnd).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }) : '';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <span className="text-base">📊</span> 今週のノード
        </h3>
        <span className="text-[10px] text-slate-400">
          {weekStartStr} 〜 {weekEndStr} ・ {data.nodes.length}キーワード
        </span>
      </div>

      {/* タグクラウド */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
        {data.nodes.map((node) => (
          <button
            key={node.id}
            onClick={() => setSelectedNode(selectedNode?.id === node.id ? null : node)}
            className="transition-all hover:opacity-80 cursor-pointer rounded-full px-1"
            style={{
              fontSize: `${getFontSize(node.frequency)}px`,
              color: node.color || '#64748b',
              fontWeight: node.frequency >= maxFreq * 0.7 ? 600 : 400,
            }}
            title={`${node.label}（${node.frequency}回, ${node.category}）`}
          >
            {node.label}
          </button>
        ))}
      </div>

      {/* 選択されたノードの詳細 */}
      {selectedNode && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: selectedNode.color }}
            />
            <span className="text-sm font-medium text-slate-700">{selectedNode.label}</span>
            <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded-full">
              {selectedNode.category}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span>出現回数: <strong className="text-slate-700">{selectedNode.frequency}</strong></span>
            {selectedNode.relatedTaskIds.length > 0 && (
              <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                タスク: {selectedNode.relatedTaskIds.length}
              </span>
            )}
            {selectedNode.relatedSeedIds.length > 0 && (
              <span className="bg-green-50 text-green-600 px-1.5 py-0.5 rounded">
                種: {selectedNode.relatedSeedIds.length}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
