// V2-H: 思考マップタブ（プロジェクト詳細内）
// チェックポイント評価済みのタスクを選択 → 左→右フロー図で思考の動きを可視化
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { MapIcon, ChevronDown, Award, ArrowRight } from 'lucide-react';

interface QualifiedTask {
  id: string;
  title: string;
  status: string;
  checkpointScore: number;
  nodeCount: number;
  edgeCount: number;
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

// フェーズの順序定義（左から右）
const PHASE_ORDER: Record<string, number> = {
  seed: 0,
  ideation: 1,
  progress: 2,
  result: 3,
};

// フェーズ別の色定義
const PHASE_COLORS: Record<string, { fill: string; stroke: string; text: string; label: string; bg: string }> = {
  seed:     { fill: '#FEF3C7', stroke: '#F59E0B', text: '#92400E', label: '着想',   bg: 'rgba(254,243,199,0.15)' },
  ideation: { fill: '#DBEAFE', stroke: '#3B82F6', text: '#1E40AF', label: '構想',   bg: 'rgba(219,234,254,0.15)' },
  progress: { fill: '#D1FAE5', stroke: '#10B981', text: '#065F46', label: '展開',   bg: 'rgba(209,250,229,0.15)' },
  result:   { fill: '#EDE9FE', stroke: '#8B5CF6', text: '#5B21B6', label: '結論',   bg: 'rgba(237,233,254,0.15)' },
};
const DEFAULT_COLOR = { fill: '#F1F5F9', stroke: '#94A3B8', text: '#475569', label: '', bg: 'rgba(241,245,249,0.15)' };

// CJK文字幅を概算
function estimateLabelWidth(label: string): number {
  let w = 0;
  for (const ch of label) {
    w += ch.charCodeAt(0) > 0x2E80 ? 12 : 7;
  }
  return w;
}

// 楕円上の角度θにおける半径を計算
function getEllipseRadiusAtAngle(rx: number, ry: number, angle: number): number {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return (rx * ry) / Math.sqrt(ry * ry * cos * cos + rx * rx * sin * sin);
}

export default function ThoughtMapTab({ projectId, projectName }: Props) {
  const [qualifiedTasks, setQualifiedTasks] = useState<QualifiedTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [nodes, setNodes] = useState<ThoughtNode[]>([]);
  const [edges, setEdges] = useState<ThoughtEdge[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTasksLoading, setIsTasksLoading] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 評価済みタスク一覧を取得
  const fetchQualifiedTasks = useCallback(async () => {
    setIsTasksLoading(true);
    try {
      const res = await fetch(`/api/nodes/thought-map?projectId=${projectId}&mode=qualified-tasks`);
      const json = await res.json();
      if (json.success) {
        setQualifiedTasks(json.data.tasks || []);
      }
    } catch (e) {
      console.error('[ThoughtMapTab] 評価済みタスク取得エラー:', e);
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

  useEffect(() => { fetchQualifiedTasks(); }, [fetchQualifiedTasks]);
  useEffect(() => { fetchThoughtData(); }, [fetchThoughtData]);

  // ===== 左→右 フローダイアグラム描画 =====
  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = svgRef.current;
    const container = containerRef.current;
    if (!container) return;

    while (svg.firstChild) svg.removeChild(svg.firstChild);
    setRenderError(null);

    try {
      const NS = 'http://www.w3.org/2000/svg';

      // --- 1. ノードをフェーズ別にグルーピング ---
      const phaseGroups: Record<string, typeof nodes> = {};
      const sortedNodes = [...nodes].sort((a, b) => a.appearOrder - b.appearOrder);

      for (const node of sortedNodes) {
        const phase = node.appearPhase || 'progress';
        if (!phaseGroups[phase]) phaseGroups[phase] = [];
        phaseGroups[phase].push(node);
      }

      // フェーズを順序で並べる
      const phaseKeys = Object.keys(phaseGroups).sort(
        (a, b) => (PHASE_ORDER[a] ?? 99) - (PHASE_ORDER[b] ?? 99)
      );
      const numColumns = phaseKeys.length || 1;

      // --- 2. レイアウト計算 ---
      const nodeRx = 52; // 楕円の横半径（固定。ラベルは省略で対応）
      const nodeRy = 18;
      const colGap = 40;  // カラム間の余白
      const rowGap = 16;  // ノード間の縦余白
      const headerHeight = 36; // フェーズヘッダーの高さ
      const padX = 24;
      const padY = 16;

      // 各カラムの幅は固定（ノード幅 + 余白）
      const colWidth = nodeRx * 2 + colGap;

      // 各カラムのノード数から高さを算出
      const maxNodesInCol = Math.max(1, ...Object.values(phaseGroups).map(g => g.length));
      const contentHeight = headerHeight + maxNodesInCol * (nodeRy * 2 + rowGap) + padY;
      const totalWidth = numColumns * colWidth + padX * 2;
      const totalHeight = contentHeight + padY * 2;

      // SVGサイズ設定（横スクロール対応）
      const displayWidth = Math.max(container.clientWidth || 800, totalWidth);
      svg.setAttribute('viewBox', `0 0 ${displayWidth} ${totalHeight}`);
      svg.setAttribute('width', String(displayWidth));
      svg.setAttribute('height', String(totalHeight));

      // --- 3. 各ノードの座標を決定 ---
      interface LayoutNode {
        id: string;
        label: string;
        phase: string;
        order: number;
        x: number;
        y: number;
        rx: number;
        ry: number;
        isMainRoute: boolean;
      }

      const layoutNodes: LayoutNode[] = [];
      const nodePositions = new Map<string, LayoutNode>();

      // カラムの開始X座標（中央寄せ）
      const totalContentWidth = numColumns * colWidth;
      const offsetX = (displayWidth - totalContentWidth) / 2;

      phaseKeys.forEach((phase, colIdx) => {
        const group = phaseGroups[phase];
        const cx = offsetX + colIdx * colWidth + colWidth / 2;

        // このカラム内のノードを上から配置
        group.forEach((node, rowIdx) => {
          const cy = padY + headerHeight + rowIdx * (nodeRy * 2 + rowGap) + nodeRy + 8;
          const ln: LayoutNode = {
            id: node.nodeId,
            label: node.nodeLabel || '',
            phase: node.appearPhase || '',
            order: node.appearOrder,
            x: cx,
            y: cy,
            rx: nodeRx,
            ry: nodeRy,
            isMainRoute: node.isMainRoute || false,
          };
          layoutNodes.push(ln);
          nodePositions.set(node.nodeId, ln);
        });
      });

      // --- 4. defs（矢印マーカー + シャドウ）---
      const defs = document.createElementNS(NS, 'defs');

      // シャドウフィルタ
      const filter = document.createElementNS(NS, 'filter');
      filter.setAttribute('id', 'node-shadow');
      filter.setAttribute('x', '-20%'); filter.setAttribute('y', '-20%');
      filter.setAttribute('width', '140%'); filter.setAttribute('height', '140%');
      const feGaussian = document.createElementNS(NS, 'feGaussianBlur');
      feGaussian.setAttribute('in', 'SourceAlpha');
      feGaussian.setAttribute('stdDeviation', '2');
      feGaussian.setAttribute('result', 'blur');
      filter.appendChild(feGaussian);
      const feOffset = document.createElementNS(NS, 'feOffset');
      feOffset.setAttribute('in', 'blur'); feOffset.setAttribute('dx', '0'); feOffset.setAttribute('dy', '1');
      feOffset.setAttribute('result', 'offsetBlur');
      filter.appendChild(feOffset);
      const feFlood = document.createElementNS(NS, 'feFlood');
      feFlood.setAttribute('flood-color', 'rgba(0,0,0,0.08)');
      feFlood.setAttribute('result', 'color');
      filter.appendChild(feFlood);
      const feComp = document.createElementNS(NS, 'feComposite');
      feComp.setAttribute('in', 'color'); feComp.setAttribute('in2', 'offsetBlur');
      feComp.setAttribute('operator', 'in'); feComp.setAttribute('result', 'shadow');
      filter.appendChild(feComp);
      const feMerge = document.createElementNS(NS, 'feMerge');
      const fm1 = document.createElementNS(NS, 'feMergeNode'); fm1.setAttribute('in', 'shadow'); feMerge.appendChild(fm1);
      const fm2 = document.createElementNS(NS, 'feMergeNode'); fm2.setAttribute('in', 'SourceGraphic'); feMerge.appendChild(fm2);
      filter.appendChild(feMerge);
      defs.appendChild(filter);

      // 矢印マーカー（メイン）
      const mkMain = document.createElementNS(NS, 'marker');
      mkMain.setAttribute('id', 'arrow-main');
      mkMain.setAttribute('viewBox', '0 0 10 7'); mkMain.setAttribute('refX', '10'); mkMain.setAttribute('refY', '3.5');
      mkMain.setAttribute('markerWidth', '8'); mkMain.setAttribute('markerHeight', '6'); mkMain.setAttribute('orient', 'auto');
      const ap1 = document.createElementNS(NS, 'path');
      ap1.setAttribute('d', 'M 0 0 L 10 3.5 L 0 7 z'); ap1.setAttribute('fill', '#64748B');
      mkMain.appendChild(ap1); defs.appendChild(mkMain);

      // 矢印マーカー（寄り道）
      const mkDetour = document.createElementNS(NS, 'marker');
      mkDetour.setAttribute('id', 'arrow-detour');
      mkDetour.setAttribute('viewBox', '0 0 10 7'); mkDetour.setAttribute('refX', '10'); mkDetour.setAttribute('refY', '3.5');
      mkDetour.setAttribute('markerWidth', '8'); mkDetour.setAttribute('markerHeight', '6'); mkDetour.setAttribute('orient', 'auto');
      const ap2 = document.createElementNS(NS, 'path');
      ap2.setAttribute('d', 'M 0 0 L 10 3.5 L 0 7 z'); ap2.setAttribute('fill', '#CBD5E1');
      mkDetour.appendChild(ap2); defs.appendChild(mkDetour);

      svg.appendChild(defs);

      // --- 5. フェーズ列の背景 + ヘッダー ---
      const bgGroup = document.createElementNS(NS, 'g');
      phaseKeys.forEach((phase, colIdx) => {
        const colors = PHASE_COLORS[phase] || DEFAULT_COLOR;
        const x = offsetX + colIdx * colWidth;

        // 列背景
        const rect = document.createElementNS(NS, 'rect');
        rect.setAttribute('x', String(x + 4));
        rect.setAttribute('y', String(padY));
        rect.setAttribute('width', String(colWidth - 8));
        rect.setAttribute('height', String(totalHeight - padY * 2));
        rect.setAttribute('rx', '8');
        rect.setAttribute('fill', colors.bg);
        rect.setAttribute('stroke', colors.stroke);
        rect.setAttribute('stroke-width', '0.5');
        rect.setAttribute('stroke-opacity', '0.3');
        bgGroup.appendChild(rect);

        // ヘッダー
        const headerBg = document.createElementNS(NS, 'rect');
        headerBg.setAttribute('x', String(x + colWidth / 2 - 28));
        headerBg.setAttribute('y', String(padY + 6));
        headerBg.setAttribute('width', '56');
        headerBg.setAttribute('height', '22');
        headerBg.setAttribute('rx', '11');
        headerBg.setAttribute('fill', colors.stroke);
        headerBg.setAttribute('opacity', '0.9');
        bgGroup.appendChild(headerBg);

        const headerText = document.createElementNS(NS, 'text');
        headerText.setAttribute('x', String(x + colWidth / 2));
        headerText.setAttribute('y', String(padY + 20));
        headerText.setAttribute('text-anchor', 'middle');
        headerText.setAttribute('fill', 'white');
        headerText.setAttribute('font-size', '11');
        headerText.setAttribute('font-weight', '700');
        headerText.textContent = colors.label;
        bgGroup.appendChild(headerText);
      });
      svg.appendChild(bgGroup);

      // --- 6. エッジ（曲線矢印）---
      const edgeGroup = document.createElementNS(NS, 'g');

      // 有効なエッジのみ
      const validEdges = edges.filter(e =>
        nodePositions.has(e.fromNodeId) && nodePositions.has(e.toNodeId) && e.fromNodeId !== e.toNodeId
      );

      for (const edge of validEdges) {
        const from = nodePositions.get(edge.fromNodeId)!;
        const to = nodePositions.get(edge.toNodeId)!;
        const isDetour = edge.edgeType === 'detour';

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));

        // 楕円の端からの接続点
        const angle = Math.atan2(dy, dx);
        const fromOffset = getEllipseRadiusAtAngle(from.rx, from.ry, angle);
        const toOffset = getEllipseRadiusAtAngle(to.rx, to.ry, angle + Math.PI);

        const x1 = from.x + (dx / dist) * fromOffset;
        const y1 = from.y + (dy / dist) * fromOffset;
        const x2 = to.x - (dx / dist) * toOffset;
        const y2 = to.y - (dy / dist) * toOffset;

        if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) continue;

        // 曲線の制御点（同カラムの場合はもっと曲げる）
        const sameColumn = Math.abs(from.x - to.x) < colWidth * 0.5;
        const curvature = sameColumn ? 40 : 20;
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        // 左→右の場合は上に曲げる、戻りの場合は下に曲げる
        const goesRight = dx >= 0;
        const cpX = midX;
        const cpY = midY + (goesRight ? -curvature : curvature);

        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', `M ${x1} ${y1} Q ${cpX} ${cpY} ${x2} ${y2}`);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', isDetour ? '#CBD5E1' : '#64748B');
        path.setAttribute('stroke-width', isDetour ? '1' : '1.5');
        if (isDetour) path.setAttribute('stroke-dasharray', '5,3');
        path.setAttribute('marker-end', isDetour ? 'url(#arrow-detour)' : 'url(#arrow-main)');
        path.setAttribute('opacity', isDetour ? '0.6' : '0.8');
        edgeGroup.appendChild(path);
      }
      svg.appendChild(edgeGroup);

      // --- 7. ノード描画 ---
      const nodeGroup = document.createElementNS(NS, 'g');
      for (const ln of layoutNodes) {
        const colors = PHASE_COLORS[ln.phase] || DEFAULT_COLOR;

        if (!isFinite(ln.x) || !isFinite(ln.y)) continue;

        const g = document.createElementNS(NS, 'g');
        g.setAttribute('transform', `translate(${ln.x}, ${ln.y})`);

        // 楕円
        const ellipse = document.createElementNS(NS, 'ellipse');
        ellipse.setAttribute('rx', String(ln.rx));
        ellipse.setAttribute('ry', String(ln.ry));
        ellipse.setAttribute('fill', colors.fill);
        ellipse.setAttribute('stroke', colors.stroke);
        ellipse.setAttribute('stroke-width', ln.isMainRoute ? '2.5' : '1.5');
        ellipse.setAttribute('filter', 'url(#node-shadow)');
        g.appendChild(ellipse);

        // ラベル（8文字以上は省略）
        const displayLabel = ln.label.length > 8 ? ln.label.slice(0, 7) + '…' : ln.label;
        const text = document.createElementNS(NS, 'text');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('fill', colors.text);
        text.setAttribute('font-size', '11');
        text.setAttribute('font-weight', '600');
        text.textContent = displayLabel;
        g.appendChild(text);

        // 順序番号（左上）
        const badge = document.createElementNS(NS, 'circle');
        badge.setAttribute('cx', String(-ln.rx + 6));
        badge.setAttribute('cy', String(-ln.ry + 2));
        badge.setAttribute('r', '7');
        badge.setAttribute('fill', colors.stroke);
        g.appendChild(badge);

        const orderText = document.createElementNS(NS, 'text');
        orderText.setAttribute('x', String(-ln.rx + 6));
        orderText.setAttribute('y', String(-ln.ry + 2));
        orderText.setAttribute('text-anchor', 'middle');
        orderText.setAttribute('dominant-baseline', 'middle');
        orderText.setAttribute('fill', 'white');
        orderText.setAttribute('font-size', '8');
        orderText.setAttribute('font-weight', '700');
        orderText.textContent = String(ln.order);
        g.appendChild(orderText);

        nodeGroup.appendChild(g);
      }
      svg.appendChild(nodeGroup);

    } catch (err) {
      console.error('[ThoughtMapTab] SVG描画エラー:', err);
      setRenderError(err instanceof Error ? err.message : 'グラフ描画中にエラーが発生しました');
    }
  }, [nodes, edges]);

  const selectedTask = qualifiedTasks.find(t => t.id === selectedTaskId);
  const currentTaskLabel = selectedTaskId
    ? (selectedTask?.title || '選択中')
    : 'タスクを選択';

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <MapIcon className="w-4 h-4 text-slate-500" />
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
          <span className="inline-block w-6 border-t-2 border-slate-500" />
          <span className="text-slate-500">メイン動線</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-6 border-t border-dashed border-slate-300" />
          <span className="text-slate-500">寄り道</span>
        </div>
      </div>

      {/* タスク選択ドロップダウン */}
      <div className="relative">
        <label className="block text-[10px] text-slate-500 mb-1 flex items-center gap-1">
          <Award className="w-3 h-3" />
          チェックポイント評価済みのタスク
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
                評価済みのタスクがありません。<br />
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
          </div>
        </div>
      )}

      {/* 思考マップ表示エリア */}
      {!selectedTaskId ? (
        <div className="flex items-center justify-center h-64 bg-white border border-slate-200 rounded-lg">
          <div className="text-center">
            <MapIcon className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-xs text-slate-400">
              上のドロップダウンから<br />評価済みのタスクを選択してください
            </p>
          </div>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center h-64 bg-white border border-slate-200 rounded-lg">
          <div className="animate-spin text-2xl">&#8987;</div>
        </div>
      ) : renderError ? (
        <div className="flex items-center justify-center h-64 bg-white border border-red-200 rounded-lg">
          <div className="text-center">
            <MapIcon className="w-8 h-8 mx-auto mb-2 text-red-300" />
            <p className="text-xs text-red-500 mb-1">グラフ描画エラー</p>
            <p className="text-[10px] text-slate-400 max-w-sm">{renderError}</p>
          </div>
        </div>
      ) : nodes.length === 0 ? (
        <div className="flex items-center justify-center h-64 bg-white border border-slate-200 rounded-lg">
          <div className="text-center">
            <MapIcon className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs text-slate-400">
              このタスクにはまだ思考ノードがありません
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 左→右フローダイアグラム */}
          <div ref={containerRef} className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <svg ref={svgRef} className="w-full" style={{ minHeight: '400px' }} />
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
