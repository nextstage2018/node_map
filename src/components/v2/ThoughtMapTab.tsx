// V2-H: 思考マップタブ（プロジェクト詳細内）
// チェックポイント85点以上のタスクを選択 → D3.js フォースグラフで思考ノードを可視化
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Map, ChevronDown, Award, ArrowRight } from 'lucide-react';

interface QualifiedTask {
  id: string;
  title: string;
  status: string;
  checkpointScore: number;
  nodeCount: number;
  edgeCount: number;
  milestoneName: string | null;
  evaluatedAt: string;
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

// フェーズ別の色定義（D3グラフ用）
const PHASE_COLORS: Record<string, { fill: string; stroke: string; text: string; label: string }> = {
  seed: { fill: '#FEF3C7', stroke: '#F59E0B', text: '#92400E', label: '種' },
  ideation: { fill: '#DBEAFE', stroke: '#3B82F6', text: '#1E40AF', label: '構想' },
  progress: { fill: '#D1FAE5', stroke: '#10B981', text: '#065F46', label: '進行' },
  result: { fill: '#EDE9FE', stroke: '#8B5CF6', text: '#5B21B6', label: '結果' },
};
const DEFAULT_COLOR = { fill: '#F1F5F9', stroke: '#94A3B8', text: '#475569', label: '' };

export default function ThoughtMapTab({ projectId, projectName }: Props) {
  const [qualifiedTasks, setQualifiedTasks] = useState<QualifiedTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [nodes, setNodes] = useState<ThoughtNode[]>([]);
  const [edges, setEdges] = useState<ThoughtEdge[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTasksLoading, setIsTasksLoading] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 85点以上タスク一覧を取得
  const fetchQualifiedTasks = useCallback(async () => {
    setIsTasksLoading(true);
    try {
      const res = await fetch(`/api/nodes/thought-map?projectId=${projectId}&mode=qualified-tasks`);
      const json = await res.json();
      if (json.success) {
        setQualifiedTasks(json.data.tasks || []);
      }
    } catch (e) {
      console.error('[ThoughtMapTab] 85点以上タスク取得エラー:', e);
    } finally {
      setIsTasksLoading(false);
    }
  }, [projectId]);

  // 選択タスクの思考データを取得
  const fetchThoughtData = useCallback(async () => {
    if (!selectedTaskId) {
      setNodes([]);
      setEdges([]);
      return;
    }
    setIsLoading(true);
    try {
      const url = `/api/nodes/thought-map?taskId=${selectedTaskId}&userId=current`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setNodes(json.data.nodes || []);
        setEdges(json.data.edges || []);
      }
    } catch (e) {
      console.error('[ThoughtMapTab] 思考データ取得エラー:', e);
    } finally {
      setIsLoading(false);
    }
  }, [selectedTaskId]);

  useEffect(() => {
    fetchQualifiedTasks();
  }, [fetchQualifiedTasks]);

  useEffect(() => {
    fetchThoughtData();
  }, [fetchThoughtData]);

  // D3.js フォースグラフ描画
  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = svgRef.current;
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = 500;

    // SVGをクリア
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));

    // D3用データを構築
    const nodeMap = new Map<string, ThoughtNode>();
    nodes.forEach(n => nodeMap.set(n.nodeId, n));

    const graphNodes = nodes.map(n => ({
      id: n.nodeId,
      label: n.nodeLabel,
      phase: n.appearPhase,
      order: n.appearOrder,
      x: width / 2 + (Math.random() - 0.5) * 200,
      y: height / 2 + (Math.random() - 0.5) * 200,
      vx: 0,
      vy: 0,
    }));

    const nodeIdSet = new Set(graphNodes.map(n => n.id));
    const graphEdges = edges
      .filter(e => nodeIdSet.has(e.fromNodeId) && nodeIdSet.has(e.toNodeId))
      .map(e => ({
        source: e.fromNodeId,
        target: e.toNodeId,
        type: e.edgeType,
      }));

    // 力学シミュレーション（簡易版）
    const nodeById = new Map(graphNodes.map(n => [n.id, n]));

    // リンクごとにsource/targetノードへの参照を持たせる
    const links = graphEdges.map(e => ({
      source: nodeById.get(e.source)!,
      target: nodeById.get(e.target)!,
      type: e.type,
    })).filter(l => l.source && l.target);

    // 簡易フォースシミュレーション
    const simulate = () => {
      const alpha = 0.3;
      const repulsion = 3000;
      const linkDistance = 120;
      const linkStrength = 0.1;
      const centerX = width / 2;
      const centerY = height / 2;
      const centerStrength = 0.05;

      for (let iter = 0; iter < 200; iter++) {
        // 反発力
        for (let i = 0; i < graphNodes.length; i++) {
          for (let j = i + 1; j < graphNodes.length; j++) {
            const a = graphNodes[i];
            const b = graphNodes[j];
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = repulsion / (dist * dist);
            const fx = (dx / dist) * force * alpha;
            const fy = (dy / dist) * force * alpha;
            a.x -= fx;
            a.y -= fy;
            b.x += fx;
            b.y += fy;
          }
        }

        // リンク引力
        for (const link of links) {
          const dx = link.target.x - link.source.x;
          const dy = link.target.y - link.source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (dist - linkDistance) * linkStrength * alpha;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          link.source.x += fx;
          link.source.y += fy;
          link.target.x -= fx;
          link.target.y -= fy;
        }

        // 中心への引力
        for (const node of graphNodes) {
          node.x += (centerX - node.x) * centerStrength * alpha;
          node.y += (centerY - node.y) * centerStrength * alpha;
        }
      }

      // 境界内に収める（パディング付き）
      const pad = 60;
      for (const node of graphNodes) {
        node.x = Math.max(pad, Math.min(width - pad, node.x));
        node.y = Math.max(pad, Math.min(height - pad, node.y));
      }
    };

    simulate();

    // SVG描画 — namespace を明示
    const NS = 'http://www.w3.org/2000/svg';

    // defs（矢印マーカー）
    const defs = document.createElementNS(NS, 'defs');

    // ドロップシャドウフィルタ
    const filter = document.createElementNS(NS, 'filter');
    filter.setAttribute('id', 'node-shadow');
    filter.setAttribute('x', '-20%');
    filter.setAttribute('y', '-20%');
    filter.setAttribute('width', '140%');
    filter.setAttribute('height', '140%');
    const feDropShadow = document.createElementNS(NS, 'feDropShadow');
    feDropShadow.setAttribute('dx', '0');
    feDropShadow.setAttribute('dy', '2');
    feDropShadow.setAttribute('stdDeviation', '3');
    feDropShadow.setAttribute('flood-color', 'rgba(0,0,0,0.1)');
    filter.appendChild(feDropShadow);
    defs.appendChild(filter);

    // 矢印マーカー
    const marker = document.createElementNS(NS, 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('viewBox', '0 0 10 7');
    marker.setAttribute('refX', '10');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('markerWidth', '8');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto');
    const arrowPath = document.createElementNS(NS, 'path');
    arrowPath.setAttribute('d', 'M 0 0 L 10 3.5 L 0 7 z');
    arrowPath.setAttribute('fill', '#94A3B8');
    marker.appendChild(arrowPath);
    defs.appendChild(marker);

    // detour矢印
    const markerDetour = document.createElementNS(NS, 'marker');
    markerDetour.setAttribute('id', 'arrowhead-detour');
    markerDetour.setAttribute('viewBox', '0 0 10 7');
    markerDetour.setAttribute('refX', '10');
    markerDetour.setAttribute('refY', '3.5');
    markerDetour.setAttribute('markerWidth', '8');
    markerDetour.setAttribute('markerHeight', '6');
    markerDetour.setAttribute('orient', 'auto');
    const arrowPathD = document.createElementNS(NS, 'path');
    arrowPathD.setAttribute('d', 'M 0 0 L 10 3.5 L 0 7 z');
    arrowPathD.setAttribute('fill', '#CBD5E1');
    markerDetour.appendChild(arrowPathD);
    defs.appendChild(markerDetour);

    svg.appendChild(defs);

    // エッジグループ
    const edgeGroup = document.createElementNS(NS, 'g');
    for (const link of links) {
      const isDetour = link.type === 'detour';

      // ノードの中心から端までのオフセットを計算
      const dx = link.target.x - link.source.x;
      const dy = link.target.y - link.source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      // ノードの半径分だけ短くする（ラベル長に応じた楕円の概算）
      const sourceLabel = nodeMap.get(link.source.id)?.nodeLabel || '';
      const targetLabel = nodeMap.get(link.target.id)?.nodeLabel || '';
      const sourceRx = Math.max(30, sourceLabel.length * 7 + 16);
      const targetRx = Math.max(30, targetLabel.length * 7 + 16);
      const sourceRy = 20;
      const targetRy = 20;

      // 楕円上の交点を概算（角度による）
      const angle = Math.atan2(dy, dx);
      const sourceOffset = getEllipseRadiusAtAngle(sourceRx, sourceRy, angle);
      const targetOffset = getEllipseRadiusAtAngle(targetRx, targetRy, angle + Math.PI);

      const x1 = link.source.x + (dx / dist) * sourceOffset;
      const y1 = link.source.y + (dy / dist) * sourceOffset;
      const x2 = link.target.x - (dx / dist) * targetOffset;
      const y2 = link.target.y - (dy / dist) * targetOffset;

      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('stroke', isDetour ? '#CBD5E1' : '#94A3B8');
      line.setAttribute('stroke-width', isDetour ? '1' : '1.5');
      line.setAttribute('stroke-dasharray', isDetour ? '4,3' : '');
      line.setAttribute('marker-end', isDetour ? 'url(#arrowhead-detour)' : 'url(#arrowhead)');
      edgeGroup.appendChild(line);
    }
    svg.appendChild(edgeGroup);

    // ノードグループ
    const nodeGroup = document.createElementNS(NS, 'g');
    for (const node of graphNodes) {
      const colors = PHASE_COLORS[node.phase] || DEFAULT_COLOR;
      const labelText = node.label;
      const rx = Math.max(30, labelText.length * 7 + 16);
      const ry = 20;

      const g = document.createElementNS(NS, 'g');
      g.setAttribute('transform', `translate(${node.x}, ${node.y})`);

      // 楕円ノード
      const ellipse = document.createElementNS(NS, 'ellipse');
      ellipse.setAttribute('rx', String(rx));
      ellipse.setAttribute('ry', String(ry));
      ellipse.setAttribute('fill', colors.fill);
      ellipse.setAttribute('stroke', colors.stroke);
      ellipse.setAttribute('stroke-width', '2');
      ellipse.setAttribute('filter', 'url(#node-shadow)');
      g.appendChild(ellipse);

      // ラベル
      const text = document.createElementNS(NS, 'text');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('fill', colors.text);
      text.setAttribute('font-size', '11');
      text.setAttribute('font-weight', '600');
      text.textContent = labelText;
      g.appendChild(text);

      // フェーズバッジ（右上）
      if (colors.label) {
        const badge = document.createElementNS(NS, 'text');
        badge.setAttribute('x', String(rx - 8));
        badge.setAttribute('y', String(-ry + 4));
        badge.setAttribute('text-anchor', 'end');
        badge.setAttribute('fill', colors.stroke);
        badge.setAttribute('font-size', '8');
        badge.setAttribute('font-weight', '500');
        badge.textContent = colors.label;
        g.appendChild(badge);
      }

      // 順序番号（左上）
      const orderBadge = document.createElementNS(NS, 'circle');
      orderBadge.setAttribute('cx', String(-rx + 8));
      orderBadge.setAttribute('cy', String(-ry + 4));
      orderBadge.setAttribute('r', '8');
      orderBadge.setAttribute('fill', colors.stroke);
      g.appendChild(orderBadge);

      const orderText = document.createElementNS(NS, 'text');
      orderText.setAttribute('x', String(-rx + 8));
      orderText.setAttribute('y', String(-ry + 4));
      orderText.setAttribute('text-anchor', 'middle');
      orderText.setAttribute('dominant-baseline', 'middle');
      orderText.setAttribute('fill', 'white');
      orderText.setAttribute('font-size', '8');
      orderText.setAttribute('font-weight', '700');
      orderText.textContent = String(node.order);
      g.appendChild(orderText);

      nodeGroup.appendChild(g);
    }
    svg.appendChild(nodeGroup);

  }, [nodes, edges]);

  const selectedTask = qualifiedTasks.find(t => t.id === selectedTaskId);
  const currentTaskLabel = selectedTaskId
    ? (selectedTask?.title || '選択中')
    : 'タスクを選択';

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Map className="w-4 h-4 text-slate-500" />
          {projectName} - 思考マップ
        </h2>
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap gap-3 text-[10px]">
        {Object.entries(PHASE_COLORS).map(([key, c]) => (
          <div key={key} className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full border" style={{ backgroundColor: c.fill, borderColor: c.stroke }} />
            <span className="text-slate-600">{c.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1 ml-2">
          <span className="inline-block w-6 border-t border-slate-400" />
          <span className="text-slate-500">メイン</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-6 border-t border-dashed border-slate-300" />
          <span className="text-slate-500">寄り道</span>
        </div>
      </div>

      {/* タスク選択ドロップダウン（85点以上のみ） */}
      <div className="relative">
        <label className="block text-[10px] text-slate-500 mb-1 flex items-center gap-1">
          <Award className="w-3 h-3" />
          チェックポイント85点以上のタスク
        </label>
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          disabled={isTasksLoading}
          className="w-full max-w-md flex items-center justify-between gap-2 px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors disabled:opacity-50"
        >
          <span className="truncate">
            {isTasksLoading ? '読み込み中...' : currentTaskLabel}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
        </button>
        {isDropdownOpen && (
          <div className="absolute z-10 mt-1 w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden max-h-72 overflow-y-auto">
            {qualifiedTasks.length === 0 ? (
              <div className="px-3 py-4 text-xs text-slate-400 text-center">
                85点以上のタスクがありません。<br />
                タスクのAI壁打ち後にチェックポイント評価を実施してください。
              </div>
            ) : (
              qualifiedTasks.map(task => (
                <button
                  key={task.id}
                  onClick={() => { setSelectedTaskId(task.id); setIsDropdownOpen(false); }}
                  className={`w-full text-left px-3 py-2.5 text-xs hover:bg-slate-50 transition-colors border-t border-slate-100 first:border-t-0 ${
                    selectedTaskId === task.id ? 'bg-blue-50 text-blue-700' : 'text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{task.title}</span>
                    <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      task.checkpointScore >= 95 ? 'bg-green-100 text-green-700'
                      : task.checkpointScore >= 90 ? 'bg-blue-100 text-blue-700'
                      : 'bg-amber-100 text-amber-700'
                    }`}>
                      {task.checkpointScore}点
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                    {task.milestoneName && <span>MS: {task.milestoneName}</span>}
                    <span>ノード{task.nodeCount} / エッジ{task.edgeCount}</span>
                    <span className={`px-1 py-0.5 rounded ${
                      task.status === 'done' ? 'bg-green-50 text-green-600'
                      : task.status === 'in_progress' ? 'bg-blue-50 text-blue-600'
                      : 'bg-slate-50 text-slate-500'
                    }`}>
                      {task.status === 'done' ? '完了' : task.status === 'in_progress' ? '進行中' : task.status}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* 選択タスク情報 */}
      {selectedTask && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <div className="flex items-center gap-2 text-xs">
            <Award className="w-4 h-4 text-blue-500" />
            <span className="font-medium text-slate-800">{selectedTask.title}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              selectedTask.checkpointScore >= 95 ? 'bg-green-100 text-green-700'
              : selectedTask.checkpointScore >= 90 ? 'bg-blue-100 text-blue-700'
              : 'bg-amber-100 text-amber-700'
            }`}>
              {selectedTask.checkpointScore}点
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
            <span>ノード: {nodes.length}個</span>
            <span>エッジ: {edges.length}本</span>
            {selectedTask.milestoneName && <span>MS: {selectedTask.milestoneName}</span>}
          </div>
        </div>
      )}

      {/* 思考マップ表示エリア */}
      {!selectedTaskId ? (
        <div className="flex items-center justify-center h-64 bg-white border border-slate-200 rounded-lg">
          <div className="text-center">
            <Map className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-xs text-slate-400">
              上のドロップダウンから<br />85点以上のタスクを選択してください
            </p>
          </div>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center h-64 bg-white border border-slate-200 rounded-lg">
          <div className="animate-spin text-2xl">&#8987;</div>
        </div>
      ) : nodes.length === 0 ? (
        <div className="flex items-center justify-center h-64 bg-white border border-slate-200 rounded-lg">
          <div className="text-center">
            <Map className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs text-slate-400">
              このタスクにはまだ思考ノードがありません
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* D3 フォースグラフ */}
          <div ref={containerRef} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <svg ref={svgRef} className="w-full" style={{ height: '500px' }} />
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

// 楕円上の角度θにおける半径を計算
function getEllipseRadiusAtAngle(rx: number, ry: number, angle: number): number {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return (rx * ry) / Math.sqrt(ry * ry * cos * cos + rx * rx * sin * sin);
}
