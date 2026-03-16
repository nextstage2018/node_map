// V2-H: 思考マップタブ — Canvas2Dベースの思考可視化
// 縦軸: 抽象↔具体 / 横軸: 会話ターン（時間）/ 再生バーで思考の変遷を追体験
// v9.2: NodeMap白背景トンマナ統一（nm-* カラー準拠）
'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ChevronDown, Award, Play, Pause, SkipBack, SkipForward, Users } from 'lucide-react';

// ===== Types =====
interface QualifiedTask {
  id: string;
  title: string;
  status: string;
  checkpointScore: number;
  nodeCount: number;
  edgeCount: number;
  evaluatedAt: string;
  assigneeName: string | null;
  assigneeContactId: string | null;
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
  isCheckpoint?: boolean;
}

interface Props {
  projectId: string;
  projectName: string;
}

// ===== Constants =====
const PHASE_ABSTRACT: Record<string, [number, number]> = {
  seed:     [0, 1],
  ideation: [0, 2],
  progress: [1, 3],
  result:   [3, 4],
};

// フェーズ色（白背景で映える濃い色）
const PHASE_COLOR: Record<string, string> = {
  seed:     '#7c3aed', // violet-600
  ideation: '#2563eb', // blue-600
  progress: '#059669', // emerald-600
  result:   '#d97706', // amber-600
};
const DEFAULT_NODE_COLOR = '#64748B'; // slate-500

// チェックポイント色
const CHECKPOINT_COLOR = '#ef4444'; // red-500

// NodeMap配色
const NM = {
  bg: '#F8FAFC',        // slate-50
  surface: '#FFFFFF',
  border: '#E2E8F0',    // slate-200
  borderHover: '#CBD5E1', // slate-300
  text: '#1E293B',      // slate-800
  textSecondary: '#64748B', // slate-500
  textMuted: '#94A3B8',  // slate-400
  primary: '#2563EB',    // blue-600
  primaryLight: '#EFF6FF', // blue-50
  primaryBorder: '#BFDBFE', // blue-200
};

// ===== Helper =====
function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

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

  // メンバーフィルタ
  const [selectedMember, setSelectedMember] = useState<string>('all');
  const [isMemberOpen, setIsMemberOpen] = useState(false);

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
  const conversationsRef = useRef<ConversationTurn[]>([]);
  const currentTurnRef = useRef(0);
  const maxTurnRef = useRef(0);
  const hoveredNodeRef = useRef<string | null>(null);

  // Sync refs
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => { currentTurnRef.current = currentTurn; }, [currentTurn]);
  useEffect(() => { maxTurnRef.current = maxTurn; }, [maxTurn]);
  useEffect(() => { hoveredNodeRef.current = hoveredNode; }, [hoveredNode]);

  // メンバー一覧を抽出
  const members = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of qualifiedTasks) {
      if (t.assigneeContactId && t.assigneeName) {
        map.set(t.assigneeContactId, t.assigneeName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [qualifiedTasks]);

  // フィルタ済みタスク一覧
  const filteredTasks = useMemo(() => {
    if (selectedMember === 'all') return qualifiedTasks;
    if (selectedMember === 'unassigned') return qualifiedTasks.filter(t => !t.assigneeContactId);
    return qualifiedTasks.filter(t => t.assigneeContactId === selectedMember);
  }, [qualifiedTasks, selectedMember]);

  // チェックポイントのターン位置
  const checkpointTurns = useMemo(() => {
    return conversations.filter(c => c.isCheckpoint && c.role === 'assistant').map(c => c.turnIndex);
  }, [conversations]);

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
        const maxNodeTurn = n.reduce((mx: number, nd: ThoughtNode) => Math.max(mx, nd.appearOrder), 0);
        const mt = Math.max(maxNodeTurn, c.filter((cv: ConversationTurn) => !cv.isCheckpoint).length);
        setMaxTurn(mt);
        setCurrentTurn(mt);
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
    const PAD_L = 56, PAD_R = 36, PAD_T = 48, PAD_B = 28;
    const usableW = W - PAD_L - PAD_R;
    const usableH = H - PAD_T - PAD_B;

    const turnRatio = maxTurn > 0 ? n.appearOrder / maxTurn : 0.5;
    const x = PAD_L + turnRatio * usableW;

    const range = PHASE_ABSTRACT[n.appearPhase] || [1, 3];
    const hash = Math.abs(hashCode(n.nodeId));
    const jitter = (hash % 100) / 100;
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

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    const turn = currentTurnRef.current;
    const allNodes = nodesRef.current;
    const allEdges = edgesRef.current;
    const allConvs = conversationsRef.current;
    const hovered = hoveredNodeRef.current;
    const mt = maxTurnRef.current;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // --- Background: 白ベース ---
    ctx.fillStyle = NM.bg;
    ctx.fillRect(0, 0, W, H);

    // Subtle grid
    ctx.strokeStyle = hexA(NM.border, 0.3);
    ctx.lineWidth = 0.5;
    for (let x = 56; x < W; x += 50) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 50) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const PAD_T = 48, PAD_B = 28, PAD_L = 56;
    const usableH = H - PAD_T - PAD_B;
    const usableW = W - PAD_L - 36;

    // Top zone: abstract (violet tint)
    const gTop = ctx.createLinearGradient(0, PAD_T, 0, PAD_T + usableH * 0.3);
    gTop.addColorStop(0, hexA('#7c3aed', 0.04));
    gTop.addColorStop(1, 'transparent');
    ctx.fillStyle = gTop;
    ctx.fillRect(PAD_L, PAD_T, W - PAD_L, usableH * 0.3);

    // Bottom zone: concrete (emerald tint)
    const gBot = ctx.createLinearGradient(0, H - PAD_B - usableH * 0.3, 0, H - PAD_B);
    gBot.addColorStop(0, 'transparent');
    gBot.addColorStop(1, hexA('#059669', 0.04));
    ctx.fillStyle = gBot;
    ctx.fillRect(PAD_L, H - PAD_B - usableH * 0.3, W - PAD_L, usableH * 0.3);

    // Mid line
    const midY = PAD_T + usableH * 0.5;
    ctx.strokeStyle = hexA(NM.border, 0.5);
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 8]);
    ctx.beginPath(); ctx.moveTo(PAD_L, midY); ctx.lineTo(W, midY); ctx.stroke();
    ctx.setLineDash([]);

    // Axis labels
    ctx.save();
    ctx.font = '600 9px "Inter", system-ui, sans-serif';
    ctx.fillStyle = hexA('#7c3aed', 0.4);
    ctx.textAlign = 'center';
    ctx.translate(16, PAD_T + usableH * 0.2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('A B S T R A C T', 0, 0);
    ctx.restore();

    ctx.save();
    ctx.font = '600 9px "Inter", system-ui, sans-serif';
    ctx.fillStyle = hexA('#059669', 0.4);
    ctx.textAlign = 'center';
    ctx.translate(16, H - PAD_B - usableH * 0.2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('C O N C R E T E', 0, 0);
    ctx.restore();

    // --- START marker ---
    if (mt > 0) {
      const startX = PAD_L;
      ctx.save();
      ctx.strokeStyle = hexA('#7c3aed', 0.2);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(startX, PAD_T - 4);
      ctx.lineTo(startX, H - PAD_B + 4);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#7c3aed';
      ctx.font = 'bold 8px "Inter", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('START', startX, PAD_T - 10);
      ctx.restore();

      // --- END marker ---
      const endX = PAD_L + usableW;
      ctx.save();
      ctx.strokeStyle = hexA('#d97706', 0.2);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(endX, PAD_T - 4);
      ctx.lineTo(endX, H - PAD_B + 4);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#d97706';
      ctx.font = 'bold 8px "Inter", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('END', endX, PAD_T - 10);
      ctx.restore();
    }

    // --- Checkpoint markers ---
    const cpTurns = allConvs.filter(c => c.isCheckpoint && c.role === 'assistant').map(c => c.turnIndex);
    for (const cpTurn of cpTurns) {
      if (cpTurn > turn) continue;
      const cpX = PAD_L + (mt > 0 ? (cpTurn / mt) * usableW : 0);
      ctx.save();
      // Vertical line
      ctx.strokeStyle = hexA(CHECKPOINT_COLOR, 0.25);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(cpX, PAD_T);
      ctx.lineTo(cpX, H - PAD_B);
      ctx.stroke();
      ctx.setLineDash([]);
      // Soft glow stripe
      const cpGrad = ctx.createLinearGradient(cpX - 18, 0, cpX + 18, 0);
      cpGrad.addColorStop(0, 'transparent');
      cpGrad.addColorStop(0.5, hexA(CHECKPOINT_COLOR, 0.04));
      cpGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = cpGrad;
      ctx.fillRect(cpX - 18, PAD_T, 36, usableH);
      // Diamond icon
      ctx.fillStyle = CHECKPOINT_COLOR;
      const dy = PAD_T - 6;
      ctx.beginPath();
      ctx.moveTo(cpX, dy - 5);
      ctx.lineTo(cpX + 4, dy);
      ctx.lineTo(cpX, dy + 5);
      ctx.lineTo(cpX - 4, dy);
      ctx.closePath();
      ctx.fill();
      // Label
      ctx.font = 'bold 7px "Inter", system-ui, sans-serif';
      ctx.fillStyle = CHECKPOINT_COLOR;
      ctx.textAlign = 'center';
      ctx.fillText('CHECK', cpX, dy - 9);
      ctx.restore();
    }

    // Turn markers at bottom
    if (mt > 0) {
      ctx.fillStyle = NM.textMuted;
      ctx.font = '8px "Inter", system-ui, sans-serif';
      ctx.textAlign = 'center';
      const step = Math.max(1, Math.ceil(mt / 12));
      for (let t = step; t <= mt; t += step) {
        const tx = PAD_L + (t / mt) * usableW;
        ctx.fillText(`T${t}`, tx, H - PAD_B + 14);
      }
    }

    // --- Current turn indicator ---
    if (turn > 0 && turn < mt && mt > 0) {
      const ctX = PAD_L + (turn / mt) * usableW;
      ctx.save();
      ctx.strokeStyle = hexA(NM.primary, 0.12);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ctX, PAD_T);
      ctx.lineTo(ctX, H - PAD_B);
      ctx.stroke();
      ctx.restore();
    }

    // --- Edges ---
    for (const edge of allEdges) {
      const fromNode = allNodes.find(n => n.nodeId === edge.fromNodeId);
      const toNode = allNodes.find(n => n.nodeId === edge.toNodeId);
      if (!fromNode || !toNode) continue;
      if (edge.fromNodeId === edge.toNodeId) continue;

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
      const col = isDetour || isAbstractJump ? '#f97316' : NM.primary; // orange-500 or blue-600

      const edgeTurn = Math.max(fromNode.appearOrder, toNode.appearOrder);
      const age = turn - edgeTurn;
      const freshness = Math.max(0.2, 1 - age / Math.max(mt, 1) * 0.5);
      const alpha = freshness * (isDetour ? 0.5 : 0.35);

      const angle = Math.atan2(pb.y - pa.y, pb.x - pa.x);
      const R = 24;
      const dist = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      if (dist < 20) continue;

      const sx = pa.x + Math.cos(angle) * R;
      const sy = pa.y + Math.sin(angle) * R;
      const ex = pb.x - Math.cos(angle) * R;
      const ey = pb.y - Math.sin(angle) * R;

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

      // Arrow
      const ha = Math.atan2(ey - cy2, ex - cx2);
      const hs = 6;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - hs * Math.cos(ha - 0.4), ey - hs * Math.sin(ha - 0.4));
      ctx.lineTo(ex - hs * Math.cos(ha + 0.4), ey - hs * Math.sin(ha + 0.4));
      ctx.closePath();
      ctx.fill();

      if (isAbstractJump && age <= 2) {
        const mx = (sx + ex) / 2;
        const my = (sy + ey) / 2;
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#f97316';
        ctx.font = 'bold 9px sans-serif';
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
      const isFirst = node.appearOrder === 1;
      const isLast = node.appearOrder === mt;
      const isHov = hovered === node.nodeId;
      const col = PHASE_COLOR[node.appearPhase] || DEFAULT_NODE_COLOR;
      const R = 24;

      ctx.save();

      if (!visible) {
        // Ghost node
        ctx.globalAlpha = 0.1;
        ctx.strokeStyle = hexA(col, 0.4);
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        continue;
      }

      const alpha = isCurrent ? 1.0 : 0.6;
      ctx.globalAlpha = alpha;

      // Hover glow (soft)
      if (isCurrent || isHov) {
        const g = ctx.createRadialGradient(pos.x, pos.y, R * 0.5, pos.x, pos.y, R * 2.2);
        g.addColorStop(0, hexA(col, isHov ? 0.12 : 0.08));
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, R * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Node fill: white circle with colored border
      ctx.shadowColor = hexA(col, isCurrent ? 0.25 : 0.1);
      ctx.shadowBlur = isHov ? 16 : isCurrent ? 10 : 4;

      // White fill
      ctx.fillStyle = NM.surface;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, R, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;

      // Colored border
      if (isFirst) {
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#7c3aed';
      } else if (isLast) {
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#d97706';
      } else if (isCurrent) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = col;
      } else {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = hexA(col, 0.4);
      }
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, R, 0, Math.PI * 2);
      ctx.stroke();

      // Small colored dot at top-right of node (phase indicator)
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(pos.x + R * 0.65, pos.y - R * 0.65, 4, 0, Math.PI * 2);
      ctx.fill();

      // START/END badges
      if (isFirst && visible) {
        ctx.globalAlpha = 1;
        // Small pill badge above
        const badgeW = 36, badgeH = 14;
        const bx = pos.x - badgeW / 2;
        const by = pos.y - R - 18;
        ctx.fillStyle = hexA('#7c3aed', 0.1);
        ctx.beginPath();
        ctx.roundRect(bx, by, badgeW, badgeH, 7);
        ctx.fill();
        ctx.fillStyle = '#7c3aed';
        ctx.font = 'bold 8px "Inter", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('START', pos.x, by + badgeH / 2);
      }
      if (isLast && visible) {
        ctx.globalAlpha = 1;
        const badgeW = 28, badgeH = 14;
        const bx = pos.x - badgeW / 2;
        const by = pos.y - R - 18;
        ctx.fillStyle = hexA('#d97706', 0.1);
        ctx.beginPath();
        ctx.roundRect(bx, by, badgeW, badgeH, 7);
        ctx.fill();
        ctx.fillStyle = '#d97706';
        ctx.font = 'bold 8px "Inter", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('END', pos.x, by + badgeH / 2);
      }

      // Pulse ring for current
      if (isCurrent) {
        ctx.globalAlpha = 0.25;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, R + 7, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Label text
      ctx.globalAlpha = isCurrent ? 1 : alpha;
      const label = node.nodeLabel || '';
      const displayLabel = label.length > 6 ? label.slice(0, 5) + '…' : label;
      const fs = Math.min(11, 120 / Math.max(label.length, 1) + 4);
      ctx.font = `${isCurrent ? '600 ' : ''}${fs}px "Inter", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isCurrent ? NM.text : NM.textSecondary;
      ctx.fillText(displayLabel, pos.x, pos.y);

      // Order number
      if (!isFirst && !isLast) {
        ctx.font = '600 7px "Inter", system-ui, sans-serif';
        ctx.fillStyle = NM.textMuted;
        ctx.fillText(`${node.appearOrder}`, pos.x, pos.y + R + 9);
      }

      ctx.restore();
    }

    ctx.restore();
  }, [getNodePos, maxTurn]);

  // ===== Canvas Size & Redraw =====
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = wrap.clientWidth * dpr;
      canvas.height = wrap.clientHeight * dpr;
      canvas.style.width = wrap.clientWidth + 'px';
      canvas.style.height = wrap.clientHeight + 'px';
      draw();
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [draw]);

  useEffect(() => { draw(); }, [currentTurn, hoveredNode, nodes, edges, draw]);

  // ===== Mouse Interaction =====
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;

    const hit = nodesRef.current.find(n => {
      if (n.appearOrder > currentTurnRef.current) return false;
      const p = getNodePos(n, W, H);
      return Math.hypot(p.x - mx, p.y - my) < 28;
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
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;

    const hit = nodesRef.current.find(n => {
      if (n.appearOrder > currentTurnRef.current) return false;
      const p = getNodePos(n, W, H);
      return Math.hypot(p.x - mx, p.y - my) < 28;
    });

    if (hit) {
      const conv = conversations.find(c => c.turnIndex === hit.appearOrder && !c.isCheckpoint) || null;
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

  const selectedTask = filteredTasks.find(t => t.id === selectedTaskId);

  return (
    <div className="flex flex-col h-full bg-nm-bg" style={{ minHeight: '600px' }}>
      {/* ===== Toolbar ===== */}
      <div className="flex items-center gap-3 px-5 h-12 border-b border-nm-border flex-shrink-0 bg-nm-surface">
        <span className="font-bold text-sm text-nm-primary">思考マップ</span>
        <span className="w-px h-4 bg-nm-border" />
        <span className="text-xs font-medium text-nm-text truncate max-w-[300px]">{selectedTask?.title || projectName}</span>
        <span className="w-px h-4 bg-nm-border" />
        <span className="text-[10px] text-nm-text-muted">縦軸：抽象 ↕ 具体　／　横軸：思考の時間</span>

        {/* メンバーフィルタ */}
        {members.length > 0 && (
          <div className="relative ml-auto">
            <button
              onClick={() => { setIsMemberOpen(!isMemberOpen); setIsDropdownOpen(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-full border border-nm-border hover:border-nm-border-hover transition-colors bg-nm-surface text-nm-text"
            >
              <Users className="w-3 h-3 text-nm-primary" />
              <span>{selectedMember === 'all' ? '全員' : members.find(m => m.id === selectedMember)?.name || '未割当'}</span>
              <ChevronDown className={`w-3 h-3 text-nm-text-muted transition-transform ${isMemberOpen ? 'rotate-180' : ''}`} />
            </button>
            {isMemberOpen && (
              <div className="absolute right-0 z-50 mt-1 w-48 rounded-lg border border-nm-border bg-nm-surface shadow-lg overflow-hidden">
                <button
                  onClick={() => { setSelectedMember('all'); setIsMemberOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-[11px] transition-colors ${selectedMember === 'all' ? 'bg-nm-primary-light text-nm-primary font-medium' : 'text-nm-text hover:bg-slate-50'}`}
                >全員</button>
                {members.map(m => (
                  <button
                    key={m.id}
                    onClick={() => { setSelectedMember(m.id); setIsMemberOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-[11px] transition-colors border-t border-nm-border ${selectedMember === m.id ? 'bg-nm-primary-light text-nm-primary font-medium' : 'text-nm-text hover:bg-slate-50'}`}
                  >{m.name}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* タスク選択 */}
        <div className={`relative ${members.length === 0 ? 'ml-auto' : ''}`}>
          <button
            onClick={() => { setIsDropdownOpen(!isDropdownOpen); setIsMemberOpen(false); }}
            disabled={isTasksLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-full border border-nm-border hover:border-nm-border-hover transition-colors bg-nm-surface text-nm-text disabled:opacity-50"
          >
            <Award className="w-3 h-3 text-nm-primary" />
            <span className="truncate max-w-[160px]">
              {isTasksLoading ? '読込中...' : selectedTask?.title || 'タスク選択'}
            </span>
            <ChevronDown className={`w-3 h-3 text-nm-text-muted transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          {isDropdownOpen && (
            <div className="absolute right-0 z-50 mt-1 w-80 rounded-lg border border-nm-border bg-nm-surface shadow-lg overflow-hidden max-h-72 overflow-y-auto">
              {filteredTasks.length === 0 ? (
                <div className="px-3 py-4 text-[11px] text-center text-nm-text-muted">
                  評価済みタスクなし
                </div>
              ) : filteredTasks.map(task => (
                <button
                  key={task.id}
                  onClick={() => { setSelectedTaskId(task.id); setIsDropdownOpen(false); }}
                  className={`w-full text-left px-3 py-2.5 text-[11px] transition-colors border-t border-nm-border ${selectedTaskId === task.id ? 'bg-nm-primary-light' : 'hover:bg-slate-50'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate font-medium ${selectedTaskId === task.id ? 'text-nm-primary' : 'text-nm-text'}`}>{task.title}</span>
                    <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-nm-primary-light text-nm-primary">
                      {task.checkpointScore}点
                    </span>
                  </div>
                  {task.assigneeName && (
                    <div className="text-[10px] mt-0.5 text-nm-text-muted">
                      担当: {task.assigneeName}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===== Canvas Area ===== */}
      <div ref={wrapRef} className="flex-1 relative overflow-hidden bg-nm-bg" style={{ minHeight: '350px' }}>
        {!selectedTaskId ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-3xl mb-3 opacity-30">🧠</div>
              <p className="text-xs text-nm-text-muted">
                タスクを選択して思考の軌跡を可視化
              </p>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-pulse text-sm text-nm-primary">読み込み中...</div>
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-nm-text-muted">思考ノードがありません</p>
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
          <div className="fixed z-50 pointer-events-none rounded-lg px-3 py-2 text-xs max-w-[200px] bg-nm-surface border border-nm-border shadow-lg"
            style={{
              top: '50%', left: '50%', transform: 'translate(-50%, -120%)',
              display: hoveredNode ? 'block' : 'none',
            }}>
            <div className="font-bold text-[13px] text-nm-text mb-0.5">{hoveredNodeData.nodeLabel}</div>
            <div className="text-[10px] text-nm-text-muted">
              <span style={{ color: PHASE_COLOR[hoveredNodeData.appearPhase] || DEFAULT_NODE_COLOR }}>
                {phaseLabel[hoveredNodeData.appearPhase] || hoveredNodeData.appearPhase}
              </span>
              　ターン {hoveredNodeData.appearOrder}
            </div>
          </div>
        )}
      </div>

      {/* ===== 会話プレビュー ===== */}
      {selectedConv && (
        <div className="flex-shrink-0 px-5 py-2.5 border-t border-nm-border text-[11px] max-h-28 overflow-y-auto bg-nm-surface">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-nm-primary">
              T{selectedConv.turnIndex} — {selectedConv.role === 'user' ? 'あなた' : 'AI'}
            </span>
            <span className="text-nm-text-muted">{phaseLabel[selectedConv.phase] || selectedConv.phase}</span>
          </div>
          <p className="text-nm-text" style={{ lineHeight: 1.6 }}>{selectedConv.content}</p>
        </div>
      )}

      {/* ===== Playback Bar ===== */}
      {nodes.length > 0 && (
        <div className="flex items-center gap-3 px-5 h-14 border-t border-nm-border flex-shrink-0 bg-nm-surface">
          {/* Play/Pause */}
          <button onClick={togglePlay}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-105 bg-nm-primary text-white">
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
          </button>

          {/* Step */}
          <button onClick={() => stepTurn(-1)}
            className="p-1.5 rounded-full border border-nm-border hover:border-nm-border-hover text-nm-text-muted transition-colors">
            <SkipBack className="w-3 h-3" />
          </button>
          <button onClick={() => stepTurn(1)}
            className="p-1.5 rounded-full border border-nm-border hover:border-nm-border-hover text-nm-text-muted transition-colors">
            <SkipForward className="w-3 h-3" />
          </button>

          {/* Track */}
          <div className="flex-1 relative h-1.5 rounded-full cursor-pointer bg-slate-100"
            onClick={handleSeek}>
            <div className="h-full rounded-full transition-all"
              style={{
                background: 'linear-gradient(90deg, #7c3aed, #2563eb, #059669)',
                width: maxTurn > 0 ? `${(currentTurn / maxTurn) * 100}%` : '0%',
              }} />
            {/* Checkpoint dots */}
            {checkpointTurns.map((cpT, i) => (
              <div key={i} className="absolute top-1/2 w-2.5 h-2.5 rounded-full"
                style={{
                  left: maxTurn > 0 ? `${(cpT / maxTurn) * 100}%` : '0%',
                  transform: 'translate(-50%, -50%)',
                  background: CHECKPOINT_COLOR,
                  boxShadow: `0 0 4px ${hexA(CHECKPOINT_COLOR, 0.4)}`,
                }} />
            ))}
            {/* Thumb */}
            <div className="absolute top-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-nm-primary pointer-events-none shadow-sm"
              style={{
                left: maxTurn > 0 ? `${(currentTurn / maxTurn) * 100}%` : '0%',
                transform: 'translate(-50%, -50%)',
              }} />
          </div>

          {/* Turn info */}
          <div className="min-w-[110px] text-right">
            <div className="font-extrabold text-base text-nm-primary">
              T{currentTurn}
              <span className="text-[10px] font-normal text-nm-text-muted ml-1">/ {maxTurn}</span>
            </div>
            <div className="text-[10px] truncate max-w-[110px] text-nm-text-muted">
              {turnDesc}
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      {nodes.length > 0 && (
        <div className="flex items-center gap-4 px-5 py-1.5 border-t border-nm-border flex-shrink-0 text-[9px] text-nm-text-muted bg-slate-50">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: '#7c3aed' }} />着想
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: '#2563eb' }} />構想
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: '#059669' }} />展開
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: '#d97706' }} />結論
          </span>
          <span className="w-px h-3 bg-nm-border" />
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rotate-45" style={{ background: CHECKPOINT_COLOR }} />チェックポイント
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5" style={{ background: '#f97316' }} />抽象ジャンプ
          </span>
        </div>
      )}
    </div>
  );
}
