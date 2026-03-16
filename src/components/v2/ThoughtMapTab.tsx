// V2-H: 思考マップタブ — Canvas2Dベースの思考可視化
// 縦軸: 抽象↔具体 / 横軸: 会話ターン（時間）/ 再生バーで思考の変遷を追体験
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown, Award, Play, Pause, SkipBack, SkipForward } from 'lucide-react';

// ===== Types =====
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

interface ConversationTurn {
  turnIndex: number;
  role: string;
  content: string;
  phase: string;
  createdAt: string;
}

interface Props {
  projectId: string;
  projectName: string;
}

// ===== Constants =====
// フェーズ → 抽象度レベル (0=最抽象, 4=最具体)
const PHASE_ABSTRACT: Record<string, [number, number]> = {
  seed:     [0, 1],
  ideation: [0, 2],
  progress: [1, 3],
  result:   [3, 4],
};

// フェーズ別の色
const PHASE_COLOR: Record<string, string> = {
  seed:     '#a259ff',
  ideation: '#4f8eff',
  progress: '#43d9ad',
  result:   '#ffd166',
};
const DEFAULT_NODE_COLOR = '#64748B';

// エッジタグの色
const EDGE_TYPE_COLOR: Record<string, string> = {
  main:   '#4f8eff',
  detour: '#ff9040',
};

// ===== Helper =====
function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// nodeIdからハッシュ値を生成（同じノードは常に同じ位置になるよう）
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}

// ===== Component =====
export default function ThoughtMapTab({ projectId, projectName }: Props) {
  const [qualifiedTasks, setQualifiedTasks] = useState<QualifiedTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [nodes, setNodes] = useState<ThoughtNode[]>([]);
  const [edges, setEdges] = useState<ThoughtEdge[]>([]);
  const [conversations, setConversations] = useState<ConversationTurn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTasksLoading, setIsTasksLoading] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // 再生状態
  const [currentTurn, setCurrentTurn] = useState(0);
  const [maxTurn, setMaxTurn] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedConv, setSelectedConv] = useState<ConversationTurn | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nodesRef = useRef<ThoughtNode[]>([]);
  const edgesRef = useRef<ThoughtEdge[]>([]);
  const currentTurnRef = useRef(0);
  const hoveredNodeRef = useRef<string | null>(null);

  // Sync refs
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  useEffect(() => { currentTurnRef.current = currentTurn; }, [currentTurn]);
  useEffect(() => { hoveredNodeRef.current = hoveredNode; }, [hoveredNode]);

  // ===== Data Fetching =====
  const fetchQualifiedTasks = useCallback(async () => {
    setIsTasksLoading(true);
    try {
      const res = await fetch(`/api/nodes/thought-map?projectId=${projectId}&mode=qualified-tasks`);
      const json = await res.json();
      if (json.success) setQualifiedTasks(json.data.tasks || []);
    } catch (e) {
      console.error('[ThoughtMap] タスク取得エラー:', e);
    } finally {
      setIsTasksLoading(false);
    }
  }, [projectId]);

  const fetchThoughtData = useCallback(async () => {
    if (!selectedTaskId) {
      setNodes([]); setEdges([]); setConversations([]);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/nodes/thought-map?taskId=${selectedTaskId}&userId=current`);
      const json = await res.json();
      if (json.success) {
        const n = json.data.nodes || [];
        const e = json.data.edges || [];
        const c = json.data.conversations || [];
        setNodes(n);
        setEdges(e);
        setConversations(c);
        // 最大ターン = ノードの最大appearOrder or 会話数
        const maxNodeTurn = n.reduce((mx: number, nd: ThoughtNode) => Math.max(mx, nd.appearOrder), 0);
        const mt = Math.max(maxNodeTurn, c.length);
        setMaxTurn(mt);
        setCurrentTurn(mt); // 最初は全表示
      }
    } catch (e) {
      console.error('[ThoughtMap] データ取得エラー:', e);
    } finally {
      setIsLoading(false);
    }
  }, [selectedTaskId]);

  useEffect(() => { fetchQualifiedTasks(); }, [fetchQualifiedTasks]);
  useEffect(() => { fetchThoughtData(); }, [fetchThoughtData]);

  // ===== Playback =====
  useEffect(() => {
    if (isPlaying) {
      if (currentTurn >= maxTurn) {
        setIsPlaying(false);
        return;
      }
      playTimerRef.current = setTimeout(() => {
        setCurrentTurn(prev => prev + 1);
      }, 600);
    }
    return () => { if (playTimerRef.current) clearTimeout(playTimerRef.current); };
  }, [isPlaying, currentTurn, maxTurn]);

  const togglePlay = () => {
    if (currentTurn >= maxTurn) {
      setCurrentTurn(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(prev => !prev);
    }
  };

  const stepTurn = (delta: number) => {
    setIsPlaying(false);
    setCurrentTurn(prev => Math.max(0, Math.min(maxTurn, prev + delta)));
  };

  // ===== Layout Calculation =====
  const getNodePos = useCallback((n: ThoughtNode, W: number, H: number) => {
    const PAD_L = 60, PAD_R = 40, PAD_T = 40, PAD_B = 40;
    const usableW = W - PAD_L - PAD_R;
    const usableH = H - PAD_T - PAD_B;

    // X = ターン位置（横軸は時間）
    const turnRatio = maxTurn > 0 ? n.appearOrder / maxTurn : 0.5;
    const x = PAD_L + turnRatio * usableW;

    // Y = 抽象度（フェーズベース + ハッシュでジッター）
    const range = PHASE_ABSTRACT[n.appearPhase] || [1, 3];
    const hash = Math.abs(hashCode(n.nodeId));
    const jitter = (hash % 100) / 100; // 0-1
    const abstractLevel = range[0] + jitter * (range[1] - range[0]);
    const y = PAD_T + (abstractLevel / 4) * usableH;

    return { x, y };
  }, [maxTurn]);

  // ===== Canvas Drawing =====
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const turn = currentTurnRef.current;
    const allNodes = nodesRef.current;
    const allEdges = edgesRef.current;
    const hovered = hoveredNodeRef.current;

    ctx.clearRect(0, 0, W, H);

    // --- Background ---
    ctx.fillStyle = '#07090f';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.018)';
    ctx.lineWidth = 1;
    for (let x = 60; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Abstract/Concrete zones
    const PAD_T = 40, PAD_B = 40, PAD_L = 60;
    const usableH = H - PAD_T - PAD_B;

    const gTop = ctx.createLinearGradient(0, PAD_T, 0, PAD_T + usableH * 0.35);
    gTop.addColorStop(0, 'rgba(162,89,255,0.06)');
    gTop.addColorStop(1, 'transparent');
    ctx.fillStyle = gTop;
    ctx.fillRect(PAD_L, PAD_T, W - PAD_L, usableH * 0.35);

    const gBot = ctx.createLinearGradient(0, H - PAD_B - usableH * 0.35, 0, H - PAD_B);
    gBot.addColorStop(0, 'transparent');
    gBot.addColorStop(1, 'rgba(67,217,173,0.06)');
    ctx.fillStyle = gBot;
    ctx.fillRect(PAD_L, H - PAD_B - usableH * 0.35, W - PAD_L, usableH * 0.35);

    // Mid line
    const midY = PAD_T + usableH * 0.5;
    ctx.strokeStyle = 'rgba(79,142,255,0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(PAD_L, midY); ctx.lineTo(W, midY); ctx.stroke();
    ctx.setLineDash([]);

    // Axis labels
    ctx.save();
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'rgba(162,89,255,0.5)';
    ctx.textAlign = 'center';
    ctx.translate(16, PAD_T + usableH * 0.25);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('抽 象', 0, 0);
    ctx.restore();

    ctx.save();
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'rgba(67,217,173,0.5)';
    ctx.textAlign = 'center';
    ctx.translate(16, H - PAD_B - usableH * 0.25);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('具 体', 0, 0);
    ctx.restore();

    // Turn markers
    if (maxTurn > 0) {
      const usableW = W - PAD_L - 40;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      const step = Math.max(1, Math.ceil(maxTurn / 15));
      for (let t = step; t <= maxTurn; t += step) {
        const tx = PAD_L + (t / maxTurn) * usableW;
        ctx.fillText(`T${t}`, tx, H - PAD_B + 14);
      }
    }

    // --- Edges ---
    for (const edge of allEdges) {
      const fromNode = allNodes.find(n => n.nodeId === edge.fromNodeId);
      const toNode = allNodes.find(n => n.nodeId === edge.toNodeId);
      if (!fromNode || !toNode) continue;
      if (edge.fromNodeId === edge.toNodeId) continue;

      // 表示条件: 両端のノードが現在のターンに表示されている
      const fromVisible = fromNode.appearOrder <= turn;
      const toVisible = toNode.appearOrder <= turn;
      if (!fromVisible || !toVisible) continue;

      const pa = getNodePos(fromNode, W, H);
      const pb = getNodePos(toNode, W, H);

      const isDetour = edge.edgeType === 'detour';
      const isAbstractJump = Math.abs(
        (PHASE_ABSTRACT[fromNode.appearPhase]?.[0] ?? 2) -
        (PHASE_ABSTRACT[toNode.appearPhase]?.[0] ?? 2)
      ) >= 2;
      const col = isDetour || isAbstractJump ? '#ff9040' : '#4f8eff';

      // 新しさで透明度調整
      const edgeTurn = Math.max(fromNode.appearOrder, toNode.appearOrder);
      const age = turn - edgeTurn;
      const freshness = Math.max(0.25, 1 - age / Math.max(maxTurn, 1) * 0.6);
      const alpha = freshness * (isDetour ? 0.7 : 0.5);

      const angle = Math.atan2(pb.y - pa.y, pb.x - pa.x);
      const R = 28;
      const dist = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      if (dist < 20) continue;

      const sx = pa.x + Math.cos(angle) * R;
      const sy = pa.y + Math.sin(angle) * R;
      const ex = pb.x - Math.cos(angle) * R;
      const ey = pb.y - Math.sin(angle) * R;

      // ベジェ曲線
      const cx1 = sx + (ex - sx) * 0.4;
      const cy1 = sy;
      const cx2 = sx + (ex - sx) * 0.6;
      const cy2 = ey;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = col;
      ctx.lineWidth = isAbstractJump ? 2 : 1.5;
      if (isDetour) ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.bezierCurveTo(cx1, cy1, cx2, cy2, ex, ey);
      ctx.stroke();
      ctx.setLineDash([]);

      // 矢印
      const ha = Math.atan2(ey - cy2, ex - cx2);
      const hs = 7;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - hs * Math.cos(ha - 0.4), ey - hs * Math.sin(ha - 0.4));
      ctx.lineTo(ex - hs * Math.cos(ha + 0.4), ey - hs * Math.sin(ha + 0.4));
      ctx.closePath();
      ctx.fill();

      // 抽象ジャンプ表示
      if (isAbstractJump && age <= 2) {
        const mx = (sx + ex) / 2;
        const my = (sy + ey) / 2;
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#ff9040';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('↕', mx, my - 8);
      }

      ctx.restore();
    }

    // --- Nodes ---
    for (const node of allNodes) {
      const pos = getNodePos(node, W, H);
      const visible = node.appearOrder <= turn;
      const isCurrent = node.appearOrder === turn;
      const isHov = hovered === node.nodeId;
      const col = PHASE_COLOR[node.appearPhase] || DEFAULT_NODE_COLOR;
      const R = 28;

      ctx.save();

      if (!visible) {
        // ゴースト表示
        ctx.globalAlpha = 0.06;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        continue;
      }

      const alpha = isCurrent ? 1.0 : 0.55;
      ctx.globalAlpha = alpha;

      // グロー
      if (isCurrent || isHov) {
        const g = ctx.createRadialGradient(pos.x, pos.y, R * 0.3, pos.x, pos.y, R * 2.5);
        g.addColorStop(0, hexA(col, isHov ? 0.35 : 0.2));
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, R * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // 影
      ctx.shadowColor = hexA(col, 0.4);
      ctx.shadowBlur = isHov ? 24 : isCurrent ? 16 : 6;

      // 塗り
      const gr = ctx.createRadialGradient(pos.x - R * 0.3, pos.y - R * 0.3, 0, pos.x, pos.y, R);
      gr.addColorStop(0, hexA(col, isCurrent ? 0.4 : 0.18));
      gr.addColorStop(1, hexA(col, isCurrent ? 0.1 : 0.04));
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, R, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.lineWidth = isCurrent ? 2.5 : 1.5;
      ctx.strokeStyle = hexA(col, isCurrent ? 0.9 : 0.35);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, R, 0, Math.PI * 2);
      ctx.stroke();

      // パルスリング
      if (isCurrent) {
        ctx.strokeStyle = hexA(col, 0.2);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, R + 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      // ラベル
      const label = node.nodeLabel || '';
      const displayLabel = label.length > 6 ? label.slice(0, 5) + '…' : label;
      const fs = Math.min(12, 140 / Math.max(label.length, 1) + 4);
      ctx.font = `${isCurrent ? 'bold ' : ''}${fs}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isCurrent ? '#fff' : hexA('#c8d4f0', 0.6);
      ctx.fillText(displayLabel, pos.x, pos.y);

      // 順序番号
      ctx.font = 'bold 8px sans-serif';
      ctx.fillStyle = hexA(col, 0.8);
      ctx.fillText(`${node.appearOrder}`, pos.x, pos.y + R + 10);

      ctx.restore();
    }
  }, [getNodePos, maxTurn]);

  // ===== Canvas Size & Redraw =====
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      canvas.width = wrap.clientWidth;
      canvas.height = wrap.clientHeight;
      draw();
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [draw]);

  // Redraw on state change
  useEffect(() => { draw(); }, [currentTurn, hoveredNode, nodes, edges, draw]);

  // ===== Mouse Interaction =====
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W = canvas.width;
    const H = canvas.height;

    const hit = nodesRef.current.find(n => {
      if (n.appearOrder > currentTurnRef.current) return false;
      const p = getNodePos(n, W, H);
      return Math.hypot(p.x - mx, p.y - my) < 32;
    });

    setHoveredNode(hit ? hit.nodeId : null);
    canvas.style.cursor = hit ? 'pointer' : 'default';
  }, [getNodePos]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W = canvas.width;
    const H = canvas.height;

    const hit = nodesRef.current.find(n => {
      if (n.appearOrder > currentTurnRef.current) return false;
      const p = getNodePos(n, W, H);
      return Math.hypot(p.x - mx, p.y - my) < 32;
    });

    if (hit) {
      // ノードクリック → そのターンの会話を表示
      const conv = conversations.find(c => c.turnIndex === hit.appearOrder) || null;
      setSelectedConv(conv);
    } else {
      setSelectedConv(null);
    }
  }, [getNodePos, conversations]);

  // ===== Seek bar =====
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    setIsPlaying(false);
    setCurrentTurn(Math.round(pct * maxTurn));
  };

  // ===== Tooltip data =====
  const hoveredNodeData = nodes.find(n => n.nodeId === hoveredNode);
  const phaseLabel: Record<string, string> = { seed: '着想', ideation: '構想', progress: '展開', result: '結論' };

  // 現在ターンのエッジ情報
  const currentEdges = edges.filter(e => {
    const from = nodes.find(n => n.nodeId === e.fromNodeId);
    const to = nodes.find(n => n.nodeId === e.toNodeId);
    return from && to && Math.max(from.appearOrder, to.appearOrder) === currentTurn;
  });
  const turnDesc = currentTurn === 0 ? '開始前' : currentEdges.length > 0
    ? currentEdges.map(e => {
        const f = nodes.find(n => n.nodeId === e.fromNodeId);
        const t = nodes.find(n => n.nodeId === e.toNodeId);
        return `${f?.nodeLabel || '?'} → ${t?.nodeLabel || '?'}`;
      }).join(' / ')
    : nodes.find(n => n.appearOrder === currentTurn)?.nodeLabel || '—';

  const selectedTask = qualifiedTasks.find(t => t.id === selectedTaskId);

  return (
    <div className="flex flex-col h-full" style={{ background: '#07090f', color: '#c8d4f0', minHeight: '600px' }}>
      {/* ===== Toolbar ===== */}
      <div className="flex items-center gap-3 px-5 h-12 border-b flex-shrink-0" style={{ borderColor: '#1a2035', background: 'rgba(7,9,15,0.95)' }}>
        <span className="font-extrabold text-sm" style={{ color: '#4f8eff' }}>思考マップ</span>
        <span style={{ width: 1, height: 20, background: '#1a2035' }} />
        <span className="text-xs font-bold">{selectedTask?.title || projectName}</span>
        <span style={{ width: 1, height: 20, background: '#1a2035' }} />
        <span className="text-[10px]" style={{ color: '#3d4d6e' }}>縦軸：抽象 ↕ 具体　／　横軸：思考の時間</span>

        {/* タスク選択 */}
        <div className="relative ml-auto">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            disabled={isTasksLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-full border transition-colors disabled:opacity-50"
            style={{ borderColor: '#1a2035', color: '#c8d4f0', background: 'transparent' }}
          >
            <Award className="w-3 h-3" style={{ color: '#4f8eff' }} />
            <span className="truncate max-w-[160px]">
              {isTasksLoading ? '読込中...' : selectedTask?.title || 'タスク選択'}
            </span>
            <ChevronDown className={`w-3 h-3 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} style={{ color: '#3d4d6e' }} />
          </button>
          {isDropdownOpen && (
            <div className="absolute right-0 z-50 mt-1 w-72 rounded-lg border overflow-hidden max-h-64 overflow-y-auto"
              style={{ background: '#0d1022', borderColor: '#1a2035' }}>
              {qualifiedTasks.length === 0 ? (
                <div className="px-3 py-4 text-[11px] text-center" style={{ color: '#3d4d6e' }}>
                  評価済みタスクなし
                </div>
              ) : qualifiedTasks.map(task => (
                <button
                  key={task.id}
                  onClick={() => { setSelectedTaskId(task.id); setIsDropdownOpen(false); }}
                  className="w-full text-left px-3 py-2 text-[11px] transition-colors border-t"
                  style={{
                    borderColor: '#1a2035',
                    background: selectedTaskId === task.id ? 'rgba(79,142,255,0.1)' : 'transparent',
                    color: selectedTaskId === task.id ? '#4f8eff' : '#c8d4f0',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate font-medium">{task.title}</span>
                    <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(79,142,255,0.15)', color: '#4f8eff' }}>
                      {task.checkpointScore}点
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===== Canvas Area ===== */}
      <div ref={wrapRef} className="flex-1 relative overflow-hidden" style={{ minHeight: '350px' }}>
        {!selectedTaskId ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-3xl mb-3" style={{ color: '#1a2035' }}>🧠</div>
              <p className="text-xs" style={{ color: '#3d4d6e' }}>
                タスクを選択して思考の軌跡を可視化
              </p>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin text-2xl">⏳</div>
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs" style={{ color: '#3d4d6e' }}>思考ノードがありません</p>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredNode(null)}
            onClick={handleCanvasClick}
            style={{ width: '100%', height: '100%' }}
          />
        )}

        {/* Tooltip */}
        {hoveredNodeData && (
          <div className="fixed z-50 pointer-events-none rounded-lg px-3 py-2 text-xs max-w-[200px]"
            style={{
              background: 'rgba(13,16,34,0.97)',
              border: '1px solid #1a2035',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              // Position near cursor - will be slightly offset
              top: '50%', left: '50%', transform: 'translate(-50%, -120%)',
              display: hoveredNode ? 'block' : 'none',
            }}>
            <div className="font-bold text-[13px] text-white mb-0.5">{hoveredNodeData.nodeLabel}</div>
            <div className="text-[10px]" style={{ color: '#3d4d6e' }}>
              <span style={{ color: PHASE_COLOR[hoveredNodeData.appearPhase] || '#64748B' }}>
                {phaseLabel[hoveredNodeData.appearPhase] || hoveredNodeData.appearPhase}
              </span>
              　ターン {hoveredNodeData.appearOrder}
            </div>
          </div>
        )}
      </div>

      {/* ===== 会話プレビュー ===== */}
      {selectedConv && (
        <div className="flex-shrink-0 px-5 py-2 border-t text-[11px] max-h-24 overflow-y-auto"
          style={{ borderColor: '#1a2035', background: 'rgba(13,16,34,0.95)' }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold" style={{ color: '#4f8eff' }}>
              T{selectedConv.turnIndex} — {selectedConv.role === 'user' ? 'あなた' : 'AI'}
            </span>
            <span style={{ color: '#3d4d6e' }}>{selectedConv.phase}</span>
          </div>
          <p style={{ color: '#c8d4f0', lineHeight: 1.5 }}>{selectedConv.content}</p>
        </div>
      )}

      {/* ===== Playback Bar ===== */}
      {nodes.length > 0 && (
        <div className="flex items-center gap-3 px-5 h-16 border-t flex-shrink-0"
          style={{ borderColor: '#1a2035', background: 'rgba(7,9,15,0.95)' }}>
          {/* Play/Pause */}
          <button onClick={togglePlay}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-opacity hover:opacity-80"
            style={{ background: '#4f8eff' }}>
            {isPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
          </button>

          {/* Step */}
          <button onClick={() => stepTurn(-1)}
            className="px-2.5 py-1 rounded-full border text-xs transition-colors"
            style={{ borderColor: '#1a2035', color: '#3d4d6e' }}>
            <SkipBack className="w-3 h-3" />
          </button>
          <button onClick={() => stepTurn(1)}
            className="px-2.5 py-1 rounded-full border text-xs transition-colors"
            style={{ borderColor: '#1a2035', color: '#3d4d6e' }}>
            <SkipForward className="w-3 h-3" />
          </button>

          {/* Track */}
          <div className="flex-1 relative h-1.5 rounded-full cursor-pointer"
            style={{ background: '#1a2035' }}
            onClick={handleSeek}>
            <div className="h-full rounded-full"
              style={{
                background: 'linear-gradient(90deg, #a259ff, #4f8eff, #43d9ad)',
                width: maxTurn > 0 ? `${(currentTurn / maxTurn) * 100}%` : '0%',
                transition: 'width 0.3s ease',
              }} />
            <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 pointer-events-none"
              style={{
                borderColor: '#4f8eff',
                left: maxTurn > 0 ? `${(currentTurn / maxTurn) * 100}%` : '0%',
                transform: 'translate(-50%, -50%)',
                transition: 'left 0.3s ease',
              }} />
          </div>

          {/* Turn info */}
          <div className="min-w-[120px] text-right">
            <div className="font-extrabold text-lg" style={{ color: '#4f8eff' }}>
              T<span>{currentTurn}</span>
            </div>
            <div className="text-[10px] truncate max-w-[120px]" style={{ color: '#3d4d6e' }}>
              {turnDesc}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
