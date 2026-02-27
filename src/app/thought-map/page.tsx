'use client';

// Phase 42f: 思考マップ可視化ページ（地形ビュー）
// 他メンバーがユーザーの思考マップ（種→タスク完了までのノード遷移）を閲覧するUI
// 3ステップ: ユーザー選択 → タスク選択 → 思考フロー可視化（力学レイアウト）

import { useState, useEffect, useRef, useCallback } from 'react';
import Header from '@/components/shared/Header';
import { ArrowLeft, User, FileText, Sprout, Circle, ArrowRight, X } from 'lucide-react';

// ========================================
// 型定義
// ========================================

interface ThoughtMapUser {
  userId: string;
  nodeCount: number;
  taskCount: number;
}

interface ThoughtMapTask {
  id: string;
  type: 'task' | 'seed';
  title: string;
  phase: string;
  status: string;
  nodeCount: number;
  edgeCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ThoughtNode {
  id: string;
  taskId?: string;
  seedId?: string;
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
  edgeType: 'main' | 'detour';
  edgeOrder: number;
}

// 力学シミュレーション用の拡張ノード型
interface SimNode extends ThoughtNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number;
  fy: number;
  radius: number;
  color: string;
  glowColor: string;
  alpha: number;
  visible: boolean;
}

// フェーズ設定
const PHASE_COLORS: Record<string, { bg: string; border: string; text: string; fill: string }> = {
  seed: { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-700', fill: '#86efac' },
  ideation: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', fill: '#93c5fd' },
  progress: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', fill: '#fcd34d' },
  result: { bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-700', fill: '#c4b5fd' },
};

const PHASE_LABELS: Record<string, string> = {
  seed: '種',
  ideation: '構想',
  progress: '進行',
  result: '成果',
};

// フェーズ別のクラスタアンカー（正規化座標 0-1）
const PHASE_ANCHORS: Record<string, { x: number; y: number }> = {
  seed: { x: 0.2, y: 0.25 },
  ideation: { x: 0.75, y: 0.2 },
  progress: { x: 0.7, y: 0.7 },
  result: { x: 0.25, y: 0.75 },
};

// フェーズ別ノードカラー（Canvas用）
const PHASE_NODE_COLORS: Record<string, string> = {
  seed: 'rgba(34,197,94,0.7)',
  ideation: 'rgba(59,130,246,0.7)',
  progress: 'rgba(168,85,247,0.7)',
  result: 'rgba(99,102,241,0.7)',
};

// メインルートのアンバー
const AMBER = '#f59e0b';
const AMBER_GLOW = 'rgba(245,158,11,0.2)';
// 飛地のピンク
const PINK = '#ec4899';
const PINK_ALPHA = 'rgba(236,72,153,0.5)';

// タイムスライダーのフェーズラベル
function getTimeLabel(time: number): string {
  if (time <= 15) return '種の段階';
  if (time <= 40) return '構想中';
  if (time <= 70) return '実行中';
  if (time <= 95) return '仕上げ';
  return '完了時';
}

// ========================================
// メインコンポーネント
// ========================================

export default function ThoughtMapPage() {
  const [step, setStep] = useState<'users' | 'tasks' | 'flow'>('users');
  const [users, setUsers] = useState<ThoughtMapUser[]>([]);
  const [tasks, setTasks] = useState<ThoughtMapTask[]>([]);
  const [nodes, setNodes] = useState<ThoughtNode[]>([]);
  const [edges, setEdges] = useState<ThoughtEdge[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<ThoughtMapTask | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ユーザー一覧取得
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/nodes/thought-map');
      const json = await res.json();
      if (json.success && json.data?.users) {
        setUsers(json.data.users);
      }
    } catch (e) {
      setError('ユーザー一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // ユーザー選択 → タスク一覧取得
  const selectUser = async (userId: string) => {
    setSelectedUser(userId);
    setStep('tasks');
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/nodes/thought-map?userId=${userId}`);
      const json = await res.json();
      if (json.success && json.data?.tasks) {
        setTasks(json.data.tasks);
      }
    } catch (e) {
      setError('タスク一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // タスク選択 → ノード＋エッジ取得
  const selectTask = async (task: ThoughtMapTask) => {
    setSelectedTask(task);
    setStep('flow');
    setLoading(true);
    setError(null);
    try {
      const paramKey = task.type === 'seed' ? 'seedId' : 'taskId';
      const res = await fetch(`/api/nodes/thought-map?userId=${selectedUser}&${paramKey}=${task.id}`);
      const json = await res.json();
      if (json.success && json.data) {
        setNodes(json.data.nodes || []);
        setEdges(json.data.edges || []);
      }
    } catch (e) {
      setError('思考データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // 戻る
  const goBack = () => {
    if (step === 'flow') {
      setStep('tasks');
      setSelectedTask(null);
      setNodes([]);
      setEdges([]);
    } else if (step === 'tasks') {
      setStep('users');
      setSelectedUser(null);
      setTasks([]);
    }
  };

  const isFlowStep = step === 'flow' && !loading && !error;

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <Header />
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* パンくず / ヘッダー */}
        <div className={`px-6 py-3 border-b flex items-center gap-3 ${isFlowStep ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
          {step !== 'users' && (
            <button
              onClick={goBack}
              className={`p-1.5 rounded-lg ${isFlowStep ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h1 className={`text-sm font-bold ${isFlowStep ? 'text-slate-100' : 'text-slate-800'}`}>
              {step === 'users' && 'メンバーの思考マップ'}
              {step === 'tasks' && `${selectedUser ? selectedUser.slice(0, 8) + '...' : ''} のタスク一覧`}
              {step === 'flow' && (selectedTask?.title || '思考フロー')}
            </h1>
            <p className={`text-xs ${isFlowStep ? 'text-slate-400' : 'text-slate-500'}`}>
              {step === 'users' && 'メンバーを選んで、その人の思考の流れを見てみましょう'}
              {step === 'tasks' && '思考ノードが記録されているタスク・種の一覧です'}
              {step === 'flow' && `${nodes.length} ノード · ${edges.length} エッジ`}
            </p>
          </div>
        </div>

        {/* メインコンテンツ */}
        {isFlowStep ? (
          // フローステップ: Canvas が画面全体を占める
          <div className="flex-1 overflow-hidden">
            <ThoughtFlowCanvas nodes={nodes} edges={edges} />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6">
            {loading && (
              <div className="flex items-center justify-center py-20">
                <div className="text-sm text-slate-500">読み込み中...</div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-600">
                {error}
              </div>
            )}

            {!loading && !error && step === 'users' && (
              <UserList users={users} onSelect={selectUser} />
            )}

            {!loading && !error && step === 'tasks' && (
              <TaskList tasks={tasks} onSelect={selectTask} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ========================================
// ユーザー一覧（変更なし）
// ========================================

function UserList({ users, onSelect }: { users: ThoughtMapUser[]; onSelect: (userId: string) => void }) {
  if (users.length === 0) {
    return (
      <div className="text-center py-20 text-slate-500">
        <User className="w-12 h-12 mx-auto mb-3 text-slate-300" />
        <p className="text-sm">まだ思考ノードが記録されているメンバーがいません</p>
        <p className="text-xs mt-1 text-slate-400">種やタスクのAI会話をすると、自動的にノードが生成されます</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {users.map((user) => (
        <button
          key={user.userId}
          onClick={() => onSelect(user.userId)}
          className="bg-white rounded-xl border border-slate-200 p-5 text-left hover:border-blue-300 hover:shadow-sm transition-all"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{user.userId.slice(0, 12)}...</p>
            </div>
          </div>
          <div className="flex gap-4 text-xs text-slate-500">
            <span>{user.nodeCount} ノード</span>
            <span>{user.taskCount} タスク/種</span>
          </div>
        </button>
      ))}
    </div>
  );
}

// ========================================
// タスク一覧（変更なし）
// ========================================

function TaskList({ tasks, onSelect }: { tasks: ThoughtMapTask[]; onSelect: (task: ThoughtMapTask) => void }) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-20 text-slate-500">
        <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
        <p className="text-sm">このメンバーの思考ノードはまだありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => {
        const phaseColor = PHASE_COLORS[task.phase] || PHASE_COLORS.ideation;
        return (
          <button
            key={task.id}
            onClick={() => onSelect(task)}
            className="w-full bg-white rounded-xl border border-slate-200 p-4 text-left hover:border-blue-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 p-1.5 rounded-lg ${phaseColor.bg}`}>
                {task.type === 'seed' ? (
                  <Sprout className={`w-4 h-4 ${phaseColor.text}`} />
                ) : (
                  <FileText className={`w-4 h-4 ${phaseColor.text}`} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${phaseColor.bg} ${phaseColor.text}`}>
                    {task.type === 'seed' ? '種' : PHASE_LABELS[task.phase] || task.phase}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
                    {task.status}
                  </span>
                </div>
                <p className="text-sm font-medium text-slate-800 truncate">{task.title}</p>
                <div className="flex gap-3 mt-2 text-xs text-slate-400">
                  <span>{task.nodeCount} ノード</span>
                  <span>{task.edgeCount} エッジ</span>
                  <span>{new Date(task.updatedAt).toLocaleDateString('ja-JP')}</span>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-300 mt-2 shrink-0" />
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ========================================
// 力学シミュレーション
// ========================================

function runForceSimulation(simNodes: SimNode[], edgeList: ThoughtEdge[]): void {
  const REPULSION = 0.004;
  const ATTRACTION = 0.03;
  const PHASE_PULL = 0.015;
  const DAMPING = 0.85;
  const ITERATIONS = 100;

  // ノード数が少ないときはシミュレーション不要
  if (simNodes.length <= 1) return;

  // エッジ用マップ
  const edgePairs: Array<{ from: SimNode; to: SimNode }> = [];
  const nodeMap = new Map(simNodes.map(n => [n.nodeId, n]));
  for (const e of edgeList) {
    const from = nodeMap.get(e.fromNodeId);
    const to = nodeMap.get(e.toNodeId);
    if (from && to) edgePairs.push({ from, to });
  }

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Reset forces
    for (const n of simNodes) { n.fx = 0; n.fy = 0; }

    // Repulsion（ノード同士の反発）
    for (let i = 0; i < simNodes.length; i++) {
      for (let j = i + 1; j < simNodes.length; j++) {
        const a = simNodes[i];
        const b = simNodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
        const force = REPULSION / (dist * dist);
        const fx = (force * dx) / dist;
        const fy = (force * dy) / dist;
        a.fx -= fx;
        a.fy -= fy;
        b.fx += fx;
        b.fy += fy;
      }
    }

    // Attraction（エッジによる引力）
    for (const { from, to } of edgePairs) {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
      const targetDist = 0.12;
      const force = ATTRACTION * (dist - targetDist);
      const fx = (force * dx) / dist;
      const fy = (force * dy) / dist;
      from.fx += fx;
      from.fy += fy;
      to.fx -= fx;
      to.fy -= fy;
    }

    // Phase cluster pull（フェーズ別アンカーへの引力）
    for (const n of simNodes) {
      const anchor = PHASE_ANCHORS[n.appearPhase] || { x: 0.5, y: 0.5 };
      n.fx += PHASE_PULL * (anchor.x - n.x);
      n.fy += PHASE_PULL * (anchor.y - n.y);
    }

    // Update velocities and positions
    for (const n of simNodes) {
      n.vx = (n.vx + n.fx) * DAMPING;
      n.vy = (n.vy + n.fy) * DAMPING;
      n.x += n.vx;
      n.y += n.vy;
      // Boundary
      n.x = Math.max(0.06, Math.min(0.94, n.x));
      n.y = Math.max(0.06, Math.min(0.94, n.y));
    }
  }
}

// ========================================
// 座標変換
// ========================================

function worldToScreen(
  wx: number, wy: number,
  cw: number, ch: number,
  panX: number, panY: number, zoom: number
): { x: number; y: number } {
  const cx = cw / 2;
  const cy = ch / 2;
  return {
    x: cx + (wx * cw - cx + panX) * zoom,
    y: cy + (wy * ch - cy + panY) * zoom,
  };
}

function screenToWorld(
  sx: number, sy: number,
  cw: number, ch: number,
  panX: number, panY: number, zoom: number
): { x: number; y: number } {
  const cx = cw / 2;
  const cy = ch / 2;
  return {
    x: ((sx - cx) / zoom + cx - panX) / cw,
    y: ((sy - cy) / zoom + cy - panY) / ch,
  };
}

// ========================================
// 思考フロー可視化（地形ビュー）
// ========================================

function ThoughtFlowCanvas({ nodes, edges }: { nodes: ThoughtNode[]; edges: ThoughtEdge[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simNodesRef = useRef<SimNode[]>([]);
  const animFrameRef = useRef<number>(0);

  // 状態
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [currentTime, setCurrentTime] = useState(100);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragPanStart, setDragPanStart] = useState({ x: 0, y: 0 });
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // 力学シミュレーションの初期化
  useEffect(() => {
    if (nodes.length === 0) return;

    const totalNodes = nodes.length;
    const simNodes: SimNode[] = nodes.map((n, i) => {
      // 初期位置: フェーズアンカー周辺にランダム配置
      const anchor = PHASE_ANCHORS[n.appearPhase] || { x: 0.5, y: 0.5 };
      const angle = (i / totalNodes) * Math.PI * 2 + Math.random() * 0.5;
      const spread = 0.1 + Math.random() * 0.1;

      const isOnMainRoute = n.isMainRoute === true;
      const isDetour = edges.some(e =>
        (e.fromNodeId === n.nodeId || e.toNodeId === n.nodeId) && e.edgeType === 'detour'
      );

      let color = PHASE_NODE_COLORS[n.appearPhase] || 'rgba(99,102,241,0.6)';
      let glowColor = 'transparent';
      let radius = 16;
      let alpha = 0.8;

      if (isOnMainRoute) {
        color = AMBER;
        glowColor = AMBER_GLOW;
        radius = 20;
        alpha = 1;
      } else if (isDetour) {
        color = PINK_ALPHA;
        radius = 12;
        alpha = 0.6;
      }

      return {
        ...n,
        x: anchor.x + Math.cos(angle) * spread,
        y: anchor.y + Math.sin(angle) * spread,
        vx: 0, vy: 0, fx: 0, fy: 0,
        radius,
        color,
        glowColor,
        alpha,
        visible: true,
      };
    });

    // 力学シミュレーション実行
    runForceSimulation(simNodes, edges);
    simNodesRef.current = simNodes;
  }, [nodes, edges]);

  // Canvas描画
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cw = container.clientWidth;
    const ch = container.clientHeight;

    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    ctx.scale(dpr, dpr);

    const simNodes = simNodesRef.current;
    if (simNodes.length === 0) return;

    const totalNodes = simNodes.length;

    // ノードの可視性を更新（タイムスライダー）
    for (const n of simNodes) {
      const threshold = (n.appearOrder / totalNodes) * 100;
      n.visible = currentTime >= threshold;
    }

    // ===== 背景 =====
    ctx.fillStyle = '#0f172a'; // slate-900
    ctx.fillRect(0, 0, cw, ch);

    // ドットグリッド
    ctx.fillStyle = 'rgba(148,163,184,0.06)';
    const gridSpacing = 30 * zoom;
    const offset = worldToScreen(0, 0, cw, ch, panX, panY, zoom);
    const startX = offset.x % gridSpacing;
    const startY = offset.y % gridSpacing;
    for (let gx = startX; gx < cw; gx += gridSpacing) {
      for (let gy = startY; gy < ch; gy += gridSpacing) {
        ctx.fillRect(gx - 1, gy - 1, 2, 2);
      }
    }

    // フェーズゾーン（4分割の背景色分け）
    // 画面を4エリアに分割: 左上=種, 右上=構想, 右下=進行, 左下=成果
    const zoneColors: Record<string, string> = {
      seed: 'rgba(34,197,94,0.04)',
      ideation: 'rgba(59,130,246,0.04)',
      progress: 'rgba(168,85,247,0.04)',
      result: 'rgba(99,102,241,0.04)',
    };
    const zoneLabelPositions: Record<string, { x: number; y: number; anchorX: 'left' | 'right'; anchorY: 'top' | 'bottom' }> = {
      seed: { x: 0.03, y: 0.05, anchorX: 'left', anchorY: 'top' },
      ideation: { x: 0.97, y: 0.05, anchorX: 'right', anchorY: 'top' },
      progress: { x: 0.97, y: 0.95, anchorX: 'right', anchorY: 'bottom' },
      result: { x: 0.03, y: 0.95, anchorX: 'left', anchorY: 'bottom' },
    };

    // 中心線を計算
    const centerScreen = worldToScreen(0.5, 0.5, cw, ch, panX, panY, zoom);
    const topLeft = worldToScreen(0, 0, cw, ch, panX, panY, zoom);
    const bottomRight = worldToScreen(1, 1, cw, ch, panX, panY, zoom);

    // 各ゾーンの背景を描画
    const zoneRects: Record<string, { x: number; y: number; w: number; h: number }> = {
      seed: { x: topLeft.x, y: topLeft.y, w: centerScreen.x - topLeft.x, h: centerScreen.y - topLeft.y },
      ideation: { x: centerScreen.x, y: topLeft.y, w: bottomRight.x - centerScreen.x, h: centerScreen.y - topLeft.y },
      progress: { x: centerScreen.x, y: centerScreen.y, w: bottomRight.x - centerScreen.x, h: bottomRight.y - centerScreen.y },
      result: { x: topLeft.x, y: centerScreen.y, w: centerScreen.x - topLeft.x, h: bottomRight.y - centerScreen.y },
    };

    for (const [phase, rect] of Object.entries(zoneRects)) {
      ctx.fillStyle = zoneColors[phase] || 'rgba(99,102,241,0.03)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }

    // ゾーン境界線（中心の十字線）
    ctx.strokeStyle = 'rgba(148,163,184,0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    // 横線
    ctx.beginPath();
    ctx.moveTo(topLeft.x, centerScreen.y);
    ctx.lineTo(bottomRight.x, centerScreen.y);
    ctx.stroke();
    // 縦線
    ctx.beginPath();
    ctx.moveTo(centerScreen.x, topLeft.y);
    ctx.lineTo(centerScreen.x, bottomRight.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // ゾーンラベル（各隅に小さく表示）
    for (const [phase, lpos] of Object.entries(zoneLabelPositions)) {
      const pos = worldToScreen(lpos.x, lpos.y, cw, ch, panX, panY, zoom);
      const label = PHASE_LABELS[phase] || phase;
      const phaseColor = PHASE_NODE_COLORS[phase] || 'rgba(99,102,241,0.3)';

      ctx.fillStyle = phaseColor.replace(/[\d.]+\)$/, '0.25)');
      ctx.font = `${Math.max(10, 12 * zoom)}px sans-serif`;
      ctx.textAlign = lpos.anchorX === 'left' ? 'left' : 'right';
      ctx.textBaseline = lpos.anchorY === 'top' ? 'top' : 'bottom';
      ctx.fillText(label, pos.x, pos.y);
    }

    // ===== エッジ描画 =====
    const nodeMap = new Map(simNodes.map(n => [n.nodeId, n]));

    for (const edge of edges) {
      const fromNode = nodeMap.get(edge.fromNodeId);
      const toNode = nodeMap.get(edge.toNodeId);
      if (!fromNode || !toNode) continue;
      if (!fromNode.visible || !toNode.visible) continue;

      const p1 = worldToScreen(fromNode.x, fromNode.y, cw, ch, panX, panY, zoom);
      const p2 = worldToScreen(toNode.x, toNode.y, cw, ch, panX, panY, zoom);

      // ベジェ曲線の制御点（少し湾曲）
      const mx = (p1.x + p2.x) / 2 + (p2.y - p1.y) * 0.1;
      const my = (p1.y + p2.y) / 2 - (p2.x - p1.x) * 0.1;

      if (edge.edgeType === 'detour') {
        // 飛地エッジ: ピンク破線
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(236,72,153,0.35)';
        ctx.lineWidth = 1.5 * zoom;
        ctx.setLineDash([5 * zoom, 5 * zoom]);
        ctx.moveTo(p1.x, p1.y);
        ctx.quadraticCurveTo(mx, my, p2.x, p2.y);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // メインエッジ: アンバーのグロー + コア
        // グロー
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(245,158,11,0.12)';
        ctx.lineWidth = 8 * zoom;
        ctx.moveTo(p1.x, p1.y);
        ctx.quadraticCurveTo(mx, my, p2.x, p2.y);
        ctx.stroke();

        // コア
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(245,158,11,0.6)';
        ctx.lineWidth = 2.5 * zoom;
        ctx.moveTo(p1.x, p1.y);
        ctx.quadraticCurveTo(mx, my, p2.x, p2.y);
        ctx.stroke();
      }
    }

    // ===== ノード描画 =====
    for (const node of simNodes) {
      if (!node.visible) {
        // 未来のノード: かすかに表示
        const pos = worldToScreen(node.x, node.y, cw, ch, panX, panY, zoom);
        const r = 4 * zoom;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(100,116,139,0.15)';
        ctx.fill();
        continue;
      }

      const pos = worldToScreen(node.x, node.y, cw, ch, panX, panY, zoom);
      const r = node.radius * zoom;
      const isHovered = hoveredNodeId === node.nodeId;
      const isSelected = selectedNodeId === node.nodeId;

      // グロー（メインルートノード）
      if (node.glowColor !== 'transparent') {
        const gradient = ctx.createRadialGradient(pos.x, pos.y, r * 0.3, pos.x, pos.y, r * 2.5);
        gradient.addColorStop(0, node.glowColor);
        gradient.addColorStop(1, 'rgba(245,158,11,0)');
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // ノード本体
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.globalAlpha = node.alpha;
      ctx.fill();
      ctx.globalAlpha = 1;

      // ホバー/選択時のハイライト
      if (isHovered || isSelected) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r + 3 * zoom, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 2 * zoom;
        ctx.stroke();
      }

      // 順序番号（ノード中央）
      if (zoom > 0.5) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = `bold ${Math.max(8, 10 * zoom)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(node.appearOrder), pos.x, pos.y);
      }

      // ラベル（ズームレベルが一定以上 or ホバー/選択時）
      if (zoom > 0.6 || isHovered || isSelected) {
        ctx.fillStyle = 'rgba(226,232,240,0.9)';
        ctx.font = `${Math.max(9, 11 * zoom)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(node.nodeLabel, pos.x, pos.y + r + 5 * zoom);
      }
    }
  }, [panX, panY, zoom, currentTime, hoveredNodeId, selectedNodeId, edges]);

  // 描画トリガー
  useEffect(() => {
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [draw]);

  // リサイズ
  useEffect(() => {
    const handleResize = () => {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(draw);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  // ===== マウスイベント =====

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setDragPanStart({ x: panX, y: panY });
  }, [panX, panY]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setMousePos({ x: e.clientX, y: e.clientY });

    if (isDragging) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setPanX(dragPanStart.x + dx / zoom);
      setPanY(dragPanStart.y + dy / zoom);
      return;
    }

    // ホバー検出
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    const simNodes = simNodesRef.current;
    let found: string | null = null;

    for (const node of simNodes) {
      if (!node.visible) continue;
      const pos = worldToScreen(node.x, node.y, cw, ch, panX, panY, zoom);
      const r = node.radius * zoom + 5;
      const dx = mx - pos.x;
      const dy = my - pos.y;
      if (dx * dx + dy * dy < r * r) {
        found = node.nodeId;
        break;
      }
    }
    setHoveredNodeId(found);
  }, [isDragging, dragStart, dragPanStart, panX, panY, zoom]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      const moved = Math.sqrt(dx * dx + dy * dy);

      // ドラッグ距離が短い = クリック
      if (moved < 5 && hoveredNodeId) {
        setSelectedNodeId(prev => prev === hoveredNodeId ? null : hoveredNodeId);
      }
    }
    setIsDragging(false);
  }, [isDragging, dragStart, hoveredNodeId]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.max(0.3, Math.min(3.0, prev * factor)));
  }, []);

  // 選択されたノードの詳細
  const selectedNode = selectedNodeId
    ? simNodesRef.current.find(n => n.nodeId === selectedNodeId)
    : null;

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-900">
        <div className="text-center text-slate-500">
          <Circle className="w-12 h-12 mx-auto mb-3 text-slate-600" />
          <p className="text-sm text-slate-400">このタスクにはまだ思考ノードがありません</p>
          <p className="text-xs mt-1 text-slate-500">AI会話でキーワードが自動抽出されると、ここに表示されます</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-slate-900">
      {/* タイムスライダー */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center gap-3 bg-slate-800/80 backdrop-blur-sm rounded-lg px-4 py-2.5">
        <span className="text-xs text-slate-400 whitespace-nowrap">時間</span>
        <input
          type="range"
          min="0"
          max="100"
          value={currentTime}
          onChange={(e) => setCurrentTime(Number(e.target.value))}
          className="flex-1 h-1.5 bg-slate-600 rounded-full appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-400 [&::-webkit-slider-thumb]:cursor-pointer"
        />
        <span className="text-xs text-amber-400 font-medium whitespace-nowrap min-w-[60px] text-right">
          {getTimeLabel(currentTime)}
        </span>
      </div>

      {/* 凡例（左下） */}
      <div className="absolute bottom-3 left-3 z-10 bg-slate-800/80 backdrop-blur-sm rounded-lg px-3 py-2.5 text-[10px] space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
          <span className="text-slate-300">メインルート</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: PINK_ALPHA }} />
          <span className="text-slate-300">寄り道</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-8 h-0.5 bg-amber-500/60 inline-block rounded" />
          <span className="text-slate-300">思考の流れ</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-8 h-0.5 inline-block rounded border-t border-dashed border-pink-500/50" />
          <span className="text-slate-300">飛地</span>
        </div>
        <hr className="border-slate-700" />
        {Object.entries(PHASE_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full inline-block" style={{
              backgroundColor: PHASE_NODE_COLORS[key] || '#6366f1',
            }} />
            <span className="text-slate-400">{label}</span>
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="w-full h-full"
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { setIsDragging(false); setHoveredNodeId(null); }}
          onWheel={handleWheel}
          className={isDragging ? 'cursor-grabbing' : (hoveredNodeId ? 'cursor-pointer' : 'cursor-grab')}
        />
      </div>

      {/* ホバーツールチップ */}
      {hoveredNodeId && !isDragging && (() => {
        const node = simNodesRef.current.find(n => n.nodeId === hoveredNodeId);
        if (!node) return null;
        return (
          <div
            className="fixed z-50 bg-slate-800 text-white rounded-lg px-3 py-2 text-xs shadow-lg pointer-events-none border border-slate-600"
            style={{ left: mousePos.x + 14, top: mousePos.y - 44 }}
          >
            <p className="font-medium text-sm">{node.nodeLabel}</p>
            <p className="text-slate-400 mt-0.5">
              {PHASE_LABELS[node.appearPhase] || node.appearPhase} · 順序 {node.appearOrder}
            </p>
          </div>
        );
      })()}

      {/* サイドパネル */}
      <div
        className={`absolute top-0 right-0 h-full w-80 bg-slate-800/95 backdrop-blur-sm border-l border-slate-700 z-20
          transform transition-transform duration-200 ${selectedNode ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {selectedNode && (
          <div className="p-4 h-full overflow-y-auto">
            {/* 閉じるボタン */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-100">{selectedNode.nodeLabel}</h3>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="p-1 rounded hover:bg-slate-700 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ノード詳細 */}
            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-500">フェーズ</span>
                <p className="text-slate-200 mt-0.5">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{ backgroundColor: (PHASE_NODE_COLORS[selectedNode.appearPhase] || '#6366f1').replace(/[\d.]+\)$/, '0.3)'), color: '#e2e8f0' }}>
                    {PHASE_LABELS[selectedNode.appearPhase] || selectedNode.appearPhase}
                  </span>
                </p>
              </div>
              <div>
                <span className="text-slate-500">出現順序</span>
                <p className="text-slate-200 mt-0.5">{selectedNode.appearOrder} / {nodes.length}</p>
              </div>
              <div>
                <span className="text-slate-500">ノードID</span>
                <p className="text-slate-400 mt-0.5 text-[10px] break-all">{selectedNode.nodeId}</p>
              </div>
              <div>
                <span className="text-slate-500">記録日時</span>
                <p className="text-slate-200 mt-0.5">{new Date(selectedNode.createdAt).toLocaleString('ja-JP')}</p>
              </div>

              {/* 接続エッジ情報 */}
              <div className="mt-4 pt-3 border-t border-slate-700">
                <span className="text-slate-500">接続</span>
                <div className="mt-1 space-y-1">
                  {edges
                    .filter(e => e.fromNodeId === selectedNode.nodeId || e.toNodeId === selectedNode.nodeId)
                    .map(e => {
                      const otherId = e.fromNodeId === selectedNode.nodeId ? e.toNodeId : e.fromNodeId;
                      const otherNode = simNodesRef.current.find(n => n.nodeId === otherId);
                      const direction = e.fromNodeId === selectedNode.nodeId ? '→' : '←';
                      return (
                        <p key={e.id} className="text-slate-300">
                          {direction} {otherNode?.nodeLabel || otherId.slice(0, 12)}
                          {e.edgeType === 'detour' && <span className="text-pink-400 ml-1">(寄り道)</span>}
                        </p>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
