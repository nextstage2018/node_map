// V2-H: 思考マップタブ（プロジェクト詳細内）
// マイルストーン選択フィルタ付きの思考マップ表示
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Map, ChevronDown, Circle, ArrowRight, Target, Flag } from 'lucide-react';

interface Milestone {
  id: string;
  title: string;
  description: string | null;
  start_context: string | null;
  status: string;
  target_date: string | null;
  sort_order: number;
}

interface ThoughtNode {
  id: string;
  nodeId: string;
  nodeLabel: string;
  userId: string;
  appearOrder: number;
  isMainRoute?: boolean;
  appearPhase: string;
  createdAt: string;
}

interface ThoughtEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: string;
  edgeOrder: number;
}

interface Props {
  projectId: string;
  projectName: string;
}

export default function ThoughtMapTab({ projectId, projectName }: Props) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string>('all');
  const [nodes, setNodes] = useState<ThoughtNode[]>([]);
  const [edges, setEdges] = useState<ThoughtEdge[]>([]);
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // マイルストーン一覧を取得
  const fetchMilestones = useCallback(async () => {
    try {
      const res = await fetch(`/api/nodes/thought-map?projectId=${projectId}&mode=milestones`);
      const json = await res.json();
      if (json.success) {
        setMilestones(json.data.milestones || []);
      }
    } catch (e) {
      console.error('[ThoughtMapTab] マイルストーン取得エラー:', e);
    }
  }, [projectId]);

  // 思考ノード＋エッジを取得
  const fetchThoughtData = useCallback(async () => {
    setIsLoading(true);
    try {
      let url = '/api/nodes/thought-map?';
      if (selectedMilestoneId === 'all') {
        // 全体マップ（ユーザーの全ノード）
        url += `mode=overview&userId=current`;
      } else {
        // マイルストーンスコープ
        url += `milestoneId=${selectedMilestoneId}&userId=current`;
      }
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setNodes(json.data.nodes || []);
        setEdges(json.data.edges || []);
        if (json.data.milestone) {
          setSelectedMilestone(json.data.milestone);
        } else {
          setSelectedMilestone(null);
        }
      }
    } catch (e) {
      console.error('[ThoughtMapTab] 思考データ取得エラー:', e);
    } finally {
      setIsLoading(false);
    }
  }, [selectedMilestoneId]);

  useEffect(() => {
    fetchMilestones();
  }, [fetchMilestones]);

  useEffect(() => {
    fetchThoughtData();
  }, [fetchThoughtData]);

  // フェーズ別の色
  const phaseColor = (phase: string) => {
    switch (phase) {
      case 'seed': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'ideation': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'progress': return 'bg-green-100 text-green-700 border-green-200';
      case 'result': return 'bg-purple-100 text-purple-700 border-purple-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const phaseLabel = (phase: string) => {
    switch (phase) {
      case 'seed': return '種';
      case 'ideation': return '構想';
      case 'progress': return '進行';
      case 'result': return '結果';
      default: return phase;
    }
  };

  const currentMilestoneLabel = selectedMilestoneId === 'all'
    ? '全て表示'
    : milestones.find(m => m.id === selectedMilestoneId)?.title || '選択中';

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Map className="w-4 h-4 text-slate-500" />
          {projectName} - 思考マップ
        </h2>
      </div>

      {/* マイルストーン選択フィルタ */}
      <div className="relative">
        <label className="block text-[10px] text-slate-500 mb-1">マイルストーン</label>
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="w-full max-w-xs flex items-center justify-between gap-2 px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
        >
          <span className="truncate">{currentMilestoneLabel}</span>
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
        </button>
        {isDropdownOpen && (
          <div className="absolute z-10 mt-1 w-full max-w-xs bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
            <button
              onClick={() => { setSelectedMilestoneId('all'); setIsDropdownOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-colors ${
                selectedMilestoneId === 'all' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'
              }`}
            >
              全て表示
            </button>
            {milestones.map(ms => (
              <button
                key={ms.id}
                onClick={() => { setSelectedMilestoneId(ms.id); setIsDropdownOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-colors border-t border-slate-100 ${
                  selectedMilestoneId === ms.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Flag className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="truncate">{ms.title}</span>
                  <span className={`text-[9px] px-1 py-0.5 rounded-full shrink-0 ${
                    ms.status === 'achieved' ? 'bg-green-100 text-green-700'
                    : ms.status === 'in_progress' ? 'bg-blue-100 text-blue-700'
                    : ms.status === 'missed' ? 'bg-red-100 text-red-700'
                    : 'bg-slate-100 text-slate-600'
                  }`}>
                    {ms.status === 'achieved' ? '達成' : ms.status === 'in_progress' ? '進行中' : ms.status === 'missed' ? '未達' : '予定'}
                  </span>
                </div>
              </button>
            ))}
            {milestones.length === 0 && (
              <div className="px-3 py-4 text-xs text-slate-400 text-center">
                マイルストーンがありません
              </div>
            )}
          </div>
        )}
      </div>

      {/* マイルストーン情報（選択時） */}
      {selectedMilestone && selectedMilestoneId !== 'all' && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
          <div className="flex items-start gap-2">
            <Target className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <div>
              {selectedMilestone.start_context && (
                <p className="text-xs text-slate-600">
                  <span className="font-medium text-slate-700">スタート地点:</span> {selectedMilestone.start_context}
                </p>
              )}
              {selectedMilestone.description && (
                <p className="text-xs text-slate-600 mt-1">
                  <span className="font-medium text-slate-700">ゴール:</span> {selectedMilestone.description}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 思考マップ表示エリア */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin text-2xl">&#8987;</div>
        </div>
      ) : nodes.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-slate-400">
          <div className="text-center">
            <Map className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs">
              {selectedMilestoneId === 'all'
                ? '思考ノードがまだありません'
                : 'このマイルストーンにはまだ思考ノードがありません'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ノード数サマリー */}
          <div className="flex items-center gap-3 text-[10px] text-slate-500">
            <span>ノード: {nodes.length}個</span>
            <span>エッジ: {edges.length}本</span>
          </div>

          {/* ノードフローの簡易ビジュアル */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex flex-wrap gap-2">
              {nodes.map((node, idx) => (
                <div key={node.id} className="flex items-center gap-1">
                  <div className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] ${phaseColor(node.appearPhase)}`}>
                    <Circle className="w-2 h-2 fill-current" />
                    <span>{node.nodeLabel}</span>
                    <span className="text-[8px] opacity-60">({phaseLabel(node.appearPhase)})</span>
                  </div>
                  {idx < nodes.length - 1 && (
                    <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* エッジ一覧（折り畳み） */}
          {edges.length > 0 && (
            <details className="group">
              <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-700">
                思考動線の詳細 ({edges.length}本)
              </summary>
              <div className="mt-2 space-y-1">
                {edges.map((edge) => {
                  const fromNode = nodes.find(n => n.nodeId === edge.fromNodeId);
                  const toNode = nodes.find(n => n.nodeId === edge.toNodeId);
                  return (
                    <div key={edge.id} className="flex items-center gap-2 text-[10px] text-slate-500 pl-2">
                      <span className="font-medium text-slate-600">{fromNode?.nodeLabel || '?'}</span>
                      <ArrowRight className="w-2.5 h-2.5" />
                      <span className="font-medium text-slate-600">{toNode?.nodeLabel || '?'}</span>
                      <span className="text-[8px] text-slate-400">({edge.edgeType})</span>
                    </div>
                  );
                })}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
