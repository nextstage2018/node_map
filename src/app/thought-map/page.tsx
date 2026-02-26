'use client';

// Phase 42f: 思考マップ可視化ページ
// 他メンバーがユーザーの思考動線（種→タスク完了までのノード遷移）を閲覧するUI
// 3ステップ: ユーザー選択 → タスク選択 → 思考フロー可視化

import { useState, useEffect, useRef, useCallback } from 'react';
import Header from '@/components/shared/Header';
import { ArrowLeft, User, FileText, Sprout, Circle, ArrowRight } from 'lucide-react';

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

// フェーズごとの色設定
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

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <Header />
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* パンくず / ヘッダー */}
        <div className="px-6 py-3 border-b border-slate-200 bg-white flex items-center gap-3">
          {step !== 'users' && (
            <button
              onClick={goBack}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h1 className="text-sm font-bold text-slate-800">
              {step === 'users' && 'メンバーの思考マップ'}
              {step === 'tasks' && `${selectedUser ? selectedUser.slice(0, 8) + '...' : ''} のタスク一覧`}
              {step === 'flow' && (selectedTask?.title || '思考フロー')}
            </h1>
            <p className="text-xs text-slate-500">
              {step === 'users' && 'メンバーを選んで、その人の思考の流れを見てみましょう'}
              {step === 'tasks' && '思考ノードが記録されているタスク・種の一覧です'}
              {step === 'flow' && `${nodes.length} ノード · ${edges.length} エッジ`}
            </p>
          </div>
        </div>

        {/* メインコンテンツ */}
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

          {!loading && !error && step === 'flow' && (
            <ThoughtFlowCanvas nodes={nodes} edges={edges} />
          )}
        </div>
      </div>
    </div>
  );
}

// ========================================
// ユーザー一覧
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
// タスク一覧
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
// 思考フロー可視化（Canvas描画）
// ========================================

function ThoughtFlowCanvas({ nodes, edges }: { nodes: ThoughtNode[]; edges: ThoughtEdge[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredNode, setHoveredNode] = useState<ThoughtNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // ノード位置の計算（フローレイアウト: 左→右 + フェーズで行分け）
  const layoutNodes = useCallback(() => {
    if (nodes.length === 0) return [];

    // フェーズごとにグループ化（出現順序で並べる）
    const sorted = [...nodes].sort((a, b) => a.appearOrder - b.appearOrder);

    const NODE_W = 140;
    const NODE_H = 44;
    const GAP_X = 60;
    const GAP_Y = 80;
    const PADDING = 40;

    // フェーズ順に行を割り当て
    const phaseOrder = ['seed', 'ideation', 'progress', 'result'];
    const phaseRows = new Map<string, number>();
    let nextRow = 0;
    for (const phase of phaseOrder) {
      if (sorted.some(n => n.appearPhase === phase)) {
        phaseRows.set(phase, nextRow);
        nextRow++;
      }
    }
    // 未知フェーズ
    for (const n of sorted) {
      if (!phaseRows.has(n.appearPhase)) {
        phaseRows.set(n.appearPhase, nextRow);
        nextRow++;
      }
    }

    // フェーズ内での列位置
    const phaseColCount = new Map<string, number>();

    return sorted.map((node) => {
      const row = phaseRows.get(node.appearPhase) || 0;
      const col = phaseColCount.get(node.appearPhase) || 0;
      phaseColCount.set(node.appearPhase, col + 1);

      return {
        ...node,
        x: PADDING + col * (NODE_W + GAP_X),
        y: PADDING + row * (NODE_H + GAP_Y),
        w: NODE_W,
        h: NODE_H,
      };
    });
  }, [nodes]);

  // Canvas描画
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const positioned = layoutNodes();
    if (positioned.length === 0) return;

    // Canvas サイズ
    const maxX = Math.max(...positioned.map(n => n.x + n.w)) + 60;
    const maxY = Math.max(...positioned.map(n => n.y + n.h)) + 60;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.max(maxX, container.clientWidth) * dpr;
    canvas.height = Math.max(maxY, container.clientHeight) * dpr;
    canvas.style.width = `${Math.max(maxX, container.clientWidth)}px`;
    canvas.style.height = `${Math.max(maxY, container.clientHeight)}px`;
    ctx.scale(dpr, dpr);

    // 背景
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // フェーズ行のラベル
    const drawnPhases = new Set<string>();
    for (const node of positioned) {
      if (!drawnPhases.has(node.appearPhase)) {
        drawnPhases.add(node.appearPhase);
        const label = PHASE_LABELS[node.appearPhase] || node.appearPhase;
        const colors = PHASE_COLORS[node.appearPhase] || PHASE_COLORS.ideation;
        ctx.fillStyle = colors.fill;
        ctx.globalAlpha = 0.15;
        ctx.fillRect(0, node.y - 12, canvas.width / dpr, node.h + 24);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#64748b';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(label, 8, node.y + 4);
      }
    }

    // ノード位置のマップ（エッジ描画用）
    const nodeMap = new Map(positioned.map(n => [n.nodeId, n]));

    // エッジ描画
    for (const edge of edges) {
      const from = nodeMap.get(edge.fromNodeId);
      const to = nodeMap.get(edge.toNodeId);
      if (!from || !to) continue;

      const x1 = from.x + from.w;
      const y1 = from.y + from.h / 2;
      const x2 = to.x;
      const y2 = to.y + to.h / 2;

      ctx.beginPath();
      ctx.strokeStyle = edge.edgeType === 'detour' ? '#94a3b8' : '#3b82f6';
      ctx.lineWidth = edge.edgeType === 'detour' ? 1 : 2;
      if (edge.edgeType === 'detour') ctx.setLineDash([4, 4]);
      else ctx.setLineDash([]);

      // ベジェ曲線で滑らかに
      const cpX = (x1 + x2) / 2;
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(cpX, y1, cpX, y2, x2, y2);
      ctx.stroke();

      // 矢印
      const arrowSize = 6;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      ctx.beginPath();
      ctx.fillStyle = edge.edgeType === 'detour' ? '#94a3b8' : '#3b82f6';
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - arrowSize * Math.cos(angle - 0.4), y2 - arrowSize * Math.sin(angle - 0.4));
      ctx.lineTo(x2 - arrowSize * Math.cos(angle + 0.4), y2 - arrowSize * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fill();
    }
    ctx.setLineDash([]);

    // ノード描画
    for (const node of positioned) {
      const colors = PHASE_COLORS[node.appearPhase] || PHASE_COLORS.ideation;
      const isHovered = hoveredNode?.nodeId === node.nodeId;

      // 影
      if (isHovered) {
        ctx.shadowColor = 'rgba(0,0,0,0.12)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;
      }

      // 背景
      ctx.fillStyle = isHovered ? '#fff' : '#fff';
      ctx.strokeStyle = isHovered ? '#3b82f6' : colors.fill;
      ctx.lineWidth = isHovered ? 2 : 1.5;
      roundRect(ctx, node.x, node.y, node.w, node.h, 10);
      ctx.fill();
      ctx.stroke();

      // 影リセット
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      // 左端のアクセントバー
      ctx.fillStyle = colors.fill;
      roundRect(ctx, node.x, node.y, 4, node.h, 10, true);
      ctx.fill();

      // 順序番号
      ctx.fillStyle = colors.fill;
      ctx.beginPath();
      ctx.arc(node.x + 18, node.y + node.h / 2, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(node.appearOrder), node.x + 18, node.y + node.h / 2);

      // ラベル
      ctx.fillStyle = '#1e293b';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const maxLabelW = node.w - 40;
      let label = node.nodeLabel;
      if (ctx.measureText(label).width > maxLabelW) {
        while (ctx.measureText(label + '…').width > maxLabelW && label.length > 0) {
          label = label.slice(0, -1);
        }
        label += '…';
      }
      ctx.fillText(label, node.x + 34, node.y + node.h / 2);
    }
  }, [nodes, edges, hoveredNode, layoutNodes]);

  useEffect(() => {
    draw();
  }, [draw]);

  // マウスイベント（ホバー検出）
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x: e.clientX, y: e.clientY });

    const positioned = layoutNodes();
    const hit = positioned.find(n => x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h);
    setHoveredNode(hit || null);
  }, [layoutNodes]);

  if (nodes.length === 0) {
    return (
      <div className="text-center py-20 text-slate-500">
        <Circle className="w-12 h-12 mx-auto mb-3 text-slate-300" />
        <p className="text-sm">このタスクにはまだ思考ノードがありません</p>
        <p className="text-xs mt-1 text-slate-400">AI会話でキーワードが自動抽出されると、ここに表示されます</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* 凡例 */}
      <div className="flex gap-4 mb-4 text-xs">
        {Object.entries(PHASE_LABELS).map(([key, label]) => {
          const colors = PHASE_COLORS[key];
          return (
            <span key={key} className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-sm ${colors.bg} ${colors.border} border`} />
              <span className="text-slate-600">{label}</span>
            </span>
          );
        })}
        <span className="flex items-center gap-1.5 ml-4">
          <span className="w-6 h-0.5 bg-blue-500 inline-block" />
          <span className="text-slate-600">メイン動線</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-6 h-0.5 bg-slate-400 inline-block border-dashed border-t-2 border-slate-400" style={{ borderStyle: 'dashed' }} />
          <span className="text-slate-600">寄り道</span>
        </span>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="bg-white rounded-xl border border-slate-200 overflow-auto"
        style={{ maxHeight: 'calc(100vh - 220px)' }}
      >
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredNode(null)}
          className="cursor-default"
        />
      </div>

      {/* ツールチップ */}
      {hoveredNode && (
        <div
          className="fixed z-50 bg-slate-800 text-white rounded-lg px-3 py-2 text-xs shadow-lg pointer-events-none"
          style={{ left: mousePos.x + 12, top: mousePos.y - 40 }}
        >
          <p className="font-medium">{hoveredNode.nodeLabel}</p>
          <p className="text-slate-300 mt-0.5">
            フェーズ: {PHASE_LABELS[hoveredNode.appearPhase] || hoveredNode.appearPhase} ·
            順序: {hoveredNode.appearOrder}
          </p>
        </div>
      )}
    </div>
  );
}

// ========================================
// ヘルパー: 角丸矩形
// ========================================

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  r: number,
  leftOnly?: boolean
) {
  ctx.beginPath();
  if (leftOnly) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
  }
  ctx.closePath();
}
