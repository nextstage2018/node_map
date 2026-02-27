'use client';

// Phase 42f+42h: 思考マップ可視化ページ（地形ビュー + 比較モード + リプレイモード）
// 他メンバーがユーザーの思考マップ（種→タスク完了までのノード遷移）を閲覧するUI
// モード: 全体マップ / 個別トレース / 比較（2人の動線重ね） / リプレイ（AI対話）

import { useState, useEffect, useRef, useCallback } from 'react';
import Header from '@/components/shared/Header';
import { ArrowLeft, User, FileText, Sprout, Circle, ArrowRight, X, MapIcon, GitBranch, MessageCircle, Loader2, Search, Users, Play, Send } from 'lucide-react';
import ConversationModal from '@/components/thought-map/ConversationModal';

// 全体マップ用のタスク簡易型
interface OverviewTask {
  id: string;
  type: 'task' | 'seed';
  title: string;
  phase: string;
}

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
  sourceConversationId?: string; // Phase 42f残り: 会話ジャンプ用
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
  result: '結果',
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
  if (time <= 20) return '種';
  if (time <= 45) return '構想';
  if (time <= 75) return '進行';
  if (time <= 95) return '結果';
  return '全体';
}

// ========================================
// メインコンポーネント
// ========================================

// Phase 42h: 比較モードのデータ型
interface CompareData {
  userA: { nodes: ThoughtNode[]; edges: ThoughtEdge[]; taskTitle: string };
  userB: { nodes: ThoughtNode[]; edges: ThoughtEdge[]; taskTitle: string };
  sharedNodeIds: string[];
  divergencePoints: Array<{
    nodeId: string;
    nodeLabel: string;
    userANextNodeIds: string[];
    userBNextNodeIds: string[];
  }>;
}

// Phase 42h: リプレイ会話メッセージ型
interface ReplayMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function ThoughtMapPage() {
  const [step, setStep] = useState<
    'users' | 'mode' | 'overview' | 'tasks' | 'flow'
    | 'compare-select' | 'compare' | 'replay-select' | 'replay'
  >('users');
  const [users, setUsers] = useState<ThoughtMapUser[]>([]);
  const [tasks, setTasks] = useState<ThoughtMapTask[]>([]);
  const [overviewTasks, setOverviewTasks] = useState<OverviewTask[]>([]);
  const [nodes, setNodes] = useState<ThoughtNode[]>([]);
  const [edges, setEdges] = useState<ThoughtEdge[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<ThoughtMapTask | null>(null);
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null); // 全体マップのフィルター
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phase 42h: 比較モード
  const [compareUserB, setCompareUserB] = useState<string | null>(null);
  const [compareTasksA, setCompareTasksA] = useState<ThoughtMapTask[]>([]);
  const [compareTasksB, setCompareTasksB] = useState<ThoughtMapTask[]>([]);
  const [compareTaskA, setCompareTaskA] = useState<ThoughtMapTask | null>(null);
  const [compareTaskB, setCompareTaskB] = useState<ThoughtMapTask | null>(null);
  const [compareData, setCompareData] = useState<CompareData | null>(null);

  // Phase 42h: リプレイモード
  const [replayTask, setReplayTask] = useState<ThoughtMapTask | null>(null);
  const [replayMessages, setReplayMessages] = useState<ReplayMessage[]>([]);
  const [replayInput, setReplayInput] = useState('');
  const [replayLoading, setReplayLoading] = useState(false);

  // Phase 42e: スナップショット（メインコンポーネントレベル）
  const [snapshots, setSnapshots] = useState<{
    initialGoal: { id: string; nodeIds: string[]; summary: string; createdAt: string } | null;
    finalLanding: { id: string; nodeIds: string[]; summary: string; createdAt: string } | null;
  }>({ initialGoal: null, finalLanding: null });

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

  // ユーザー選択 → モード選択画面へ
  const selectUser = (userId: string) => {
    setSelectedUser(userId);
    setStep('mode');
  };

  // 全体マップモード
  const enterOverview = async () => {
    if (!selectedUser) return;
    setStep('overview');
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/nodes/thought-map?userId=${selectedUser}&mode=overview`);
      const json = await res.json();
      if (json.success && json.data) {
        setNodes(json.data.nodes || []);
        setEdges(json.data.edges || []);
        setOverviewTasks(json.data.tasks || []);
      }
    } catch (e) {
      setError('全体マップの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // 個別トレースモード → タスク一覧取得
  const enterTrace = async () => {
    if (!selectedUser) return;
    setStep('tasks');
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/nodes/thought-map?userId=${selectedUser}`);
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
    setSnapshots({ initialGoal: null, finalLanding: null });
    try {
      const paramKey = task.type === 'seed' ? 'seedId' : 'taskId';
      const res = await fetch(`/api/nodes/thought-map?userId=${selectedUser}&${paramKey}=${task.id}`);
      const json = await res.json();
      if (json.success && json.data) {
        setNodes(json.data.nodes || []);
        setEdges(json.data.edges || []);
      }

      // Phase 42e: タスクの場合はスナップショットも取得
      if (task.type === 'task') {
        try {
          const snapRes = await fetch(`/api/nodes/snapshots?taskId=${task.id}`);
          const snapJson = await snapRes.json();
          if (snapJson.success && snapJson.data) {
            setSnapshots(snapJson.data);
          }
        } catch { /* スナップショット取得失敗は無視 */ }
      }
    } catch (e) {
      setError('思考データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // Phase 42h: 比較モード開始
  const enterCompare = async () => {
    if (!selectedUser) return;
    setStep('compare-select');
    setLoading(true);
    try {
      // ユーザーAのタスク一覧
      const res = await fetch(`/api/nodes/thought-map?userId=${selectedUser}`);
      const json = await res.json();
      if (json.success && json.data?.tasks) {
        setCompareTasksA(json.data.tasks.filter((t: ThoughtMapTask) => t.type === 'task'));
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  // Phase 42h: 比較対象ユーザーBのタスク取得
  const selectCompareUserB = async (userId: string) => {
    setCompareUserB(userId);
    setLoading(true);
    try {
      const res = await fetch(`/api/nodes/thought-map?userId=${userId}`);
      const json = await res.json();
      if (json.success && json.data?.tasks) {
        setCompareTasksB(json.data.tasks.filter((t: ThoughtMapTask) => t.type === 'task'));
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  // Phase 42h: 比較実行
  const executeCompare = async () => {
    if (!selectedUser || !compareUserB || !compareTaskA || !compareTaskB) return;
    setStep('compare');
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        userAId: selectedUser,
        taskAId: compareTaskA.id,
        userBId: compareUserB,
        taskBId: compareTaskB.id,
      });
      const res = await fetch(`/api/nodes/thought-map/compare?${params}`);
      const json = await res.json();
      if (json.success && json.data) {
        setCompareData(json.data);
      } else {
        setError(json.error || '比較データの取得に失敗');
      }
    } catch {
      setError('比較データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // Phase 42h: リプレイモード開始
  const enterReplay = async () => {
    if (!selectedUser) return;
    setStep('replay-select');
    setLoading(true);
    try {
      const res = await fetch(`/api/nodes/thought-map?userId=${selectedUser}`);
      const json = await res.json();
      if (json.success && json.data?.tasks) {
        // 完了済みタスクのみ表示
        setTasks(json.data.tasks.filter((t: ThoughtMapTask) => t.type === 'task' && t.status === 'done'));
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  // Phase 42h: リプレイ対象タスク選択
  const selectReplayTask = async (task: ThoughtMapTask) => {
    setReplayTask(task);
    setReplayMessages([]);
    setReplayInput('');
    setStep('replay');
    // タスクのノード＋エッジも取得（Canvas表示用）
    setLoading(true);
    try {
      const res = await fetch(`/api/nodes/thought-map?userId=${selectedUser}&taskId=${task.id}`);
      const json = await res.json();
      if (json.success && json.data) {
        setNodes(json.data.nodes || []);
        setEdges(json.data.edges || []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  // Phase 42h: リプレイAI送信
  const sendReplayMessage = async () => {
    if (!replayTask || !replayInput.trim() || replayLoading) return;
    const msg = replayInput.trim();
    setReplayInput('');
    const newMessages: ReplayMessage[] = [...replayMessages, { role: 'user', content: msg }];
    setReplayMessages(newMessages);
    setReplayLoading(true);
    try {
      const res = await fetch('/api/thought-map/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: replayTask.id,
          message: msg,
          conversationHistory: replayMessages,
        }),
      });
      const json = await res.json();
      if (json.success && json.data?.reply) {
        setReplayMessages([...newMessages, { role: 'assistant', content: json.data.reply }]);
      } else {
        setReplayMessages([...newMessages, { role: 'assistant', content: 'エラー: ' + (json.error || '応答生成に失敗') }]);
      }
    } catch {
      setReplayMessages([...newMessages, { role: 'assistant', content: '通信エラーが発生しました。' }]);
    } finally {
      setReplayLoading(false);
    }
  };

  // 戻る
  const goBack = () => {
    if (step === 'flow') {
      setStep('tasks');
      setSelectedTask(null);
      setNodes([]);
      setEdges([]);
    } else if (step === 'tasks' || step === 'overview') {
      setStep('mode');
      setNodes([]);
      setEdges([]);
      setOverviewTasks([]);
      setHighlightTaskId(null);
    } else if (step === 'compare-select') {
      setStep('mode');
      setCompareUserB(null);
      setCompareTaskA(null);
      setCompareTaskB(null);
      setCompareTasksA([]);
      setCompareTasksB([]);
    } else if (step === 'compare') {
      setStep('compare-select');
      setCompareData(null);
    } else if (step === 'replay-select') {
      setStep('mode');
      setTasks([]);
    } else if (step === 'replay') {
      setStep('replay-select');
      setReplayTask(null);
      setReplayMessages([]);
      setNodes([]);
      setEdges([]);
    } else if (step === 'mode') {
      setStep('users');
      setSelectedUser(null);
      setTasks([]);
    }
  };

  const isCanvasStep = (step === 'flow' || step === 'overview' || step === 'compare' || step === 'replay') && !loading && !error;

  // ヘッダーテキスト
  const getHeaderTitle = () => {
    switch (step) {
      case 'users': return 'メンバーの思考マップ';
      case 'mode': return `${selectedUser ? selectedUser.slice(0, 8) + '...' : ''} の思考マップ`;
      case 'overview': return '全体マップ — 知識の地図';
      case 'tasks': return '個別トレース — タスクを選択';
      case 'flow': return selectedTask?.title || '思考フロー';
      case 'compare-select': return '比較モード — タスクを選択';
      case 'compare': return '比較モード';
      case 'replay-select': return 'リプレイ — 完了タスクを選択';
      case 'replay': return `リプレイ — ${replayTask?.title || ''}`;
    }
  };
  const getHeaderSub = () => {
    switch (step) {
      case 'users': return 'メンバーを選んで、その人の思考の流れを見てみましょう';
      case 'mode': return '表示モードを選んでください';
      case 'overview': return `${nodes.length} ノード · ${edges.length} エッジ`;
      case 'tasks': return '思考ノードが記録されているタスク・種の一覧です';
      case 'flow': return `${nodes.length} ノード · ${edges.length} エッジ`;
      case 'compare-select': return '2人のユーザーのタスクを選んで思考を比較します';
      case 'compare': return compareData ? `共有ノード ${compareData.sharedNodeIds.length}件 · 分岐点 ${compareData.divergencePoints.length}件` : '';
      case 'replay-select': return '完了済みタスクを選んで、過去の思考をAIに質問できます';
      case 'replay': return `${nodes.length} ノード · AI対話`;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <Header />
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* パンくず / ヘッダー */}
        <div className={`px-6 py-3 border-b flex items-center gap-3 ${isCanvasStep ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
          {step !== 'users' && (
            <button
              onClick={goBack}
              className={`p-1.5 rounded-lg ${isCanvasStep ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h1 className={`text-sm font-bold ${isCanvasStep ? 'text-slate-100' : 'text-slate-800'}`}>
              {getHeaderTitle()}
            </h1>
            <p className={`text-xs ${isCanvasStep ? 'text-slate-400' : 'text-slate-500'}`}>
              {getHeaderSub()}
            </p>
          </div>
        </div>

        {/* メインコンテンツ */}
        {step === 'replay' && !loading && !error ? (
          /* Phase 42h: リプレイモード — 左Canvas + 右AIチャット */
          <div className="flex-1 overflow-hidden flex">
            <div className="flex-1">
              <ThoughtFlowCanvas
                nodes={nodes}
                edges={edges}
                mode="trace"
                overviewTasks={[]}
                highlightTaskId={null}
                onHighlightTask={() => {}}
                onSelectRelatedTask={selectTask}
              />
            </div>
            <div className="w-96 border-l border-slate-700 bg-slate-800 flex flex-col">
              {/* リプレイチャットヘッダー */}
              <div className="px-4 py-3 border-b border-slate-700">
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Play className="w-4 h-4 text-emerald-400" />
                  思考リプレイ
                </h3>
                <p className="text-[10px] text-slate-400 mt-1">
                  このタスクの過去の思考プロセスについてAIに質問できます
                </p>
              </div>
              {/* メッセージエリア */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {replayMessages.length === 0 && (
                  <div className="text-center py-8">
                    <Play className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                    <p className="text-xs text-slate-500">「なぜこの判断をしたのか」など、<br/>過去の思考について質問してみましょう</p>
                    <div className="mt-4 space-y-1.5">
                      {['このタスクの思考の流れを要約して', 'なぜこの方向に進んだのか？', '初期ゴールと着地点はどう変わった？'].map(q => (
                        <button
                          key={q}
                          onClick={() => { setReplayInput(q); }}
                          className="block w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200
                            bg-slate-700/30 hover:bg-slate-700/60 rounded-lg transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {replayMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-200 border border-slate-600'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {replayLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-xs text-slate-400 flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      考え中...
                    </div>
                  </div>
                )}
              </div>
              {/* 入力エリア */}
              <div className="px-4 py-3 border-t border-slate-700">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="質問を入力..."
                    value={replayInput}
                    onChange={e => setReplayInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReplayMessage(); } }}
                    className="flex-1 px-3 py-2 text-xs bg-slate-700 border border-slate-600 rounded-lg
                      text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={sendReplayMessage}
                    disabled={!replayInput.trim() || replayLoading}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 rounded-lg
                      text-white transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : step === 'compare' && !loading && !error && compareData ? (
          /* Phase 42h: 比較モード — 比較Canvas */
          <div className="flex-1 overflow-hidden">
            <CompareCanvas compareData={compareData} />
          </div>
        ) : isCanvasStep ? (
          <div className="flex-1 overflow-hidden">
            <ThoughtFlowCanvas
              nodes={nodes}
              edges={edges}
              mode={step === 'overview' ? 'overview' : 'trace'}
              overviewTasks={overviewTasks}
              highlightTaskId={highlightTaskId}
              onHighlightTask={setHighlightTaskId}
              onSelectRelatedTask={selectTask}
            />
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

            {!loading && !error && step === 'mode' && (
              <ModeSelect onOverview={enterOverview} onTrace={enterTrace} onCompare={enterCompare} onReplay={enterReplay} />
            )}

            {!loading && !error && step === 'tasks' && (
              <TaskList tasks={tasks} onSelect={selectTask} />
            )}

            {!loading && !error && step === 'compare-select' && (
              <CompareSelect
                users={users}
                selectedUserA={selectedUser}
                tasksA={compareTasksA}
                selectedTaskA={compareTaskA}
                onSelectTaskA={setCompareTaskA}
                userB={compareUserB}
                onSelectUserB={selectCompareUserB}
                tasksB={compareTasksB}
                selectedTaskB={compareTaskB}
                onSelectTaskB={setCompareTaskB}
                onExecute={executeCompare}
              />
            )}

            {!loading && !error && step === 'replay-select' && (
              <TaskList tasks={tasks} onSelect={selectReplayTask} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ========================================
// モード選択
// ========================================

function ModeSelect({ onOverview, onTrace, onCompare, onReplay }: {
  onOverview: () => void;
  onTrace: () => void;
  onCompare: () => void;
  onReplay: () => void;
}) {
  return (
    <div className="max-w-xl mx-auto space-y-4 mt-8">
      <button
        onClick={onOverview}
        className="w-full bg-white rounded-xl border border-slate-200 p-6 text-left hover:border-blue-300 hover:shadow-md transition-all group"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
            <MapIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800 group-hover:text-blue-700">全体マップ</h3>
            <p className="text-sm text-slate-500 mt-1">この人の全ての知識ノードを1つの地図に表示。どんな領域に知識が広がっているかが一目でわかります。</p>
          </div>
        </div>
      </button>

      <button
        onClick={onTrace}
        className="w-full bg-white rounded-xl border border-slate-200 p-6 text-left hover:border-amber-300 hover:shadow-md transition-all group"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
            <GitBranch className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800 group-hover:text-amber-700">個別トレース</h3>
            <p className="text-sm text-slate-500 mt-1">特定のタスクや種を選んで、その中でどう思考が発展していったかを時系列で追います。</p>
          </div>
        </div>
      </button>

      <button
        onClick={onCompare}
        className="w-full bg-white rounded-xl border border-slate-200 p-6 text-left hover:border-rose-300 hover:shadow-md transition-all group"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800 group-hover:text-rose-700">比較モード</h3>
            <p className="text-sm text-slate-500 mt-1">2人のタスクの思考動線を重ねて表示。共有する知識と分岐点（認識のズレ）を可視化します。</p>
          </div>
        </div>
      </button>

      <button
        onClick={onReplay}
        className="w-full bg-white rounded-xl border border-slate-200 p-6 text-left hover:border-emerald-300 hover:shadow-md transition-all group"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
            <Play className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800 group-hover:text-emerald-700">リプレイ</h3>
            <p className="text-sm text-slate-500 mt-1">完了したタスクの思考を再現し、「なぜこの判断をしたのか」などをAIに質問できます。</p>
          </div>
        </div>
      </button>
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
// Phase 42h: 比較対象選択UI
// ========================================

function CompareSelect({
  users, selectedUserA, tasksA, selectedTaskA, onSelectTaskA,
  userB, onSelectUserB, tasksB, selectedTaskB, onSelectTaskB,
  onExecute,
}: {
  users: ThoughtMapUser[];
  selectedUserA: string | null;
  tasksA: ThoughtMapTask[];
  selectedTaskA: ThoughtMapTask | null;
  onSelectTaskA: (t: ThoughtMapTask) => void;
  userB: string | null;
  onSelectUserB: (userId: string) => void;
  tasksB: ThoughtMapTask[];
  selectedTaskB: ThoughtMapTask | null;
  onSelectTaskB: (t: ThoughtMapTask) => void;
  onExecute: () => void;
}) {
  const otherUsers = users.filter(u => u.userId !== selectedUserA);

  return (
    <div className="max-w-3xl mx-auto mt-6 space-y-6">
      <div className="grid grid-cols-2 gap-6">
        {/* ユーザーA（既に選択済み） */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <h3 className="text-sm font-bold text-slate-700">ユーザーA</h3>
            <span className="text-xs text-slate-400">{selectedUserA?.slice(0, 12)}...</span>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {tasksA.length === 0 ? (
              <p className="text-xs text-slate-400">タスクがありません</p>
            ) : tasksA.map(t => (
              <button
                key={t.id}
                onClick={() => onSelectTaskA(t)}
                className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-all ${
                  selectedTaskA?.id === t.id
                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                    : 'bg-white border-slate-200 hover:border-amber-200 text-slate-700'
                }`}
              >
                <p className="font-medium truncate">{t.title}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{t.nodeCount} ノード · {t.status}</p>
              </button>
            ))}
          </div>
        </div>

        {/* ユーザーB */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <h3 className="text-sm font-bold text-slate-700">ユーザーB</h3>
          </div>

          {/* ユーザーB選択 */}
          {!userB ? (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {otherUsers.length === 0 ? (
                <p className="text-xs text-slate-400">他のユーザーがいません</p>
              ) : otherUsers.map(u => (
                <button
                  key={u.userId}
                  onClick={() => onSelectUserB(u.userId)}
                  className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 bg-white hover:border-blue-200 text-xs text-slate-700 transition-all"
                >
                  <p className="font-medium">{u.userId.slice(0, 16)}...</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{u.nodeCount} ノード · {u.taskCount} タスク</p>
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>{userB.slice(0, 12)}...</span>
                <button onClick={() => { /* reset is handled by goBack */ }} className="text-blue-500 hover:underline text-[10px]">
                  変更
                </button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {tasksB.length === 0 ? (
                  <p className="text-xs text-slate-400">タスクがありません</p>
                ) : tasksB.map(t => (
                  <button
                    key={t.id}
                    onClick={() => onSelectTaskB(t)}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-all ${
                      selectedTaskB?.id === t.id
                        ? 'bg-blue-50 border-blue-300 text-blue-800'
                        : 'bg-white border-slate-200 hover:border-blue-200 text-slate-700'
                    }`}
                  >
                    <p className="font-medium truncate">{t.title}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{t.nodeCount} ノード · {t.status}</p>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 比較実行ボタン */}
      <div className="text-center pt-2">
        <button
          onClick={onExecute}
          disabled={!selectedTaskA || !selectedTaskB}
          className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-300
            text-white text-sm font-medium rounded-xl transition-colors"
        >
          比較する
        </button>
      </div>
    </div>
  );
}

// ========================================
// Phase 42h: 比較Canvas
// ========================================

function CompareCanvas({ compareData }: { compareData: CompareData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simNodesRef = useRef<(SimNode & { owner: 'A' | 'B' | 'shared' })[]>([]);
  const animFrameRef = useRef<number>(0);

  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragPanStart, setDragPanStart] = useState({ x: 0, y: 0 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const sharedSet = new Set(compareData.sharedNodeIds);
  const divergenceSet = new Set(compareData.divergencePoints.map(d => d.nodeId));

  // 力学シミュレーション初期化
  useEffect(() => {
    const allNodesMap = new Map<string, SimNode & { owner: 'A' | 'B' | 'shared' }>();
    const allEdges: ThoughtEdge[] = [];

    // ユーザーAのノード
    for (const n of compareData.userA.nodes) {
      if (allNodesMap.has(n.nodeId)) continue;
      const isShared = sharedSet.has(n.nodeId);
      const isDivergence = divergenceSet.has(n.nodeId);
      const anchor = PHASE_ANCHORS[n.appearPhase] || { x: 0.5, y: 0.5 };
      allNodesMap.set(n.nodeId, {
        ...n,
        x: anchor.x + (Math.random() - 0.5) * 0.2 + (isShared ? 0 : -0.1),
        y: anchor.y + (Math.random() - 0.5) * 0.2,
        vx: 0, vy: 0, fx: 0, fy: 0,
        radius: isDivergence ? 22 : (isShared ? 20 : 16),
        color: isShared ? 'rgba(168,85,247,0.8)' : 'rgba(245,158,11,0.8)',
        glowColor: isDivergence ? 'rgba(239,68,68,0.3)' : 'transparent',
        alpha: 0.9,
        visible: true,
        owner: isShared ? 'shared' : 'A',
      });
    }

    // ユーザーBのノード
    for (const n of compareData.userB.nodes) {
      if (allNodesMap.has(n.nodeId)) continue;
      const anchor = PHASE_ANCHORS[n.appearPhase] || { x: 0.5, y: 0.5 };
      allNodesMap.set(n.nodeId, {
        ...n,
        x: anchor.x + (Math.random() - 0.5) * 0.2 + 0.1,
        y: anchor.y + (Math.random() - 0.5) * 0.2,
        vx: 0, vy: 0, fx: 0, fy: 0,
        radius: 16,
        color: 'rgba(59,130,246,0.8)',
        glowColor: 'transparent',
        alpha: 0.9,
        visible: true,
        owner: 'B',
      });
    }

    // エッジ統合
    const edgeKeySet = new Set<string>();
    for (const e of [...compareData.userA.edges, ...compareData.userB.edges]) {
      const key = `${e.fromNodeId}-${e.toNodeId}`;
      if (edgeKeySet.has(key)) continue;
      edgeKeySet.add(key);
      allEdges.push(e);
    }

    const simNodes = Array.from(allNodesMap.values());
    runForceSimulation(simNodes, allEdges);
    simNodesRef.current = simNodes;
  }, [compareData]);

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

    // 背景
    ctx.fillStyle = '#0f172a';
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

    // エッジ描画
    const nodeMap = new Map(simNodes.map(n => [n.nodeId, n]));
    const allEdges = [...compareData.userA.edges, ...compareData.userB.edges];
    const drawnEdges = new Set<string>();

    for (const edge of allEdges) {
      const key = `${edge.fromNodeId}-${edge.toNodeId}`;
      if (drawnEdges.has(key)) continue;
      drawnEdges.add(key);

      const from = nodeMap.get(edge.fromNodeId);
      const to = nodeMap.get(edge.toNodeId);
      if (!from || !to) continue;

      const p1 = worldToScreen(from.x, from.y, cw, ch, panX, panY, zoom);
      const p2 = worldToScreen(to.x, to.y, cw, ch, panX, panY, zoom);
      const mx = (p1.x + p2.x) / 2 + (p2.y - p1.y) * 0.1;
      const my = (p1.y + p2.y) / 2 - (p2.x - p1.x) * 0.1;

      // エッジ色: Aのエッジ=アンバー、Bのエッジ=青、共有=紫
      const isAEdge = compareData.userA.edges.some(e => e.fromNodeId === edge.fromNodeId && e.toNodeId === edge.toNodeId);
      const isBEdge = compareData.userB.edges.some(e => e.fromNodeId === edge.fromNodeId && e.toNodeId === edge.toNodeId);
      const edgeColor = (isAEdge && isBEdge) ? 'rgba(168,85,247,0.6)' : isAEdge ? 'rgba(245,158,11,0.5)' : 'rgba(59,130,246,0.5)';

      ctx.beginPath();
      ctx.strokeStyle = edgeColor;
      ctx.lineWidth = 2 * zoom;
      ctx.moveTo(p1.x, p1.y);
      ctx.quadraticCurveTo(mx, my, p2.x, p2.y);
      ctx.stroke();

      // 矢印
      const arrowSize = 5 * zoom;
      const t = 0.85;
      const ax = (1-t)*(1-t)*p1.x + 2*(1-t)*t*mx + t*t*p2.x;
      const ay = (1-t)*(1-t)*p1.y + 2*(1-t)*t*my + t*t*p2.y;
      const angle = Math.atan2(p2.y - ay, p2.x - ax);
      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(p2.x - arrowSize * Math.cos(angle - 0.4), p2.y - arrowSize * Math.sin(angle - 0.4));
      ctx.lineTo(p2.x - arrowSize * Math.cos(angle + 0.4), p2.y - arrowSize * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fillStyle = edgeColor;
      ctx.fill();
    }

    // ノード描画
    for (const node of simNodes) {
      const pos = worldToScreen(node.x, node.y, cw, ch, panX, panY, zoom);
      const r = node.radius * zoom;
      const isHovered = hoveredNodeId === node.nodeId;

      // 分岐点: 赤パルスグロー
      if (node.glowColor !== 'transparent') {
        const pulse = 1 + 0.15 * Math.sin(Date.now() / 300);
        const gradient = ctx.createRadialGradient(pos.x, pos.y, r * 0.3, pos.x, pos.y, r * 2.5 * pulse);
        gradient.addColorStop(0, 'rgba(239,68,68,0.4)');
        gradient.addColorStop(1, 'rgba(239,68,68,0)');
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r * 2.5 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // ノード本体
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();

      // 共有ノード: 二重リング
      if (node.owner === 'shared') {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r + 4 * zoom, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(168,85,247,0.6)';
        ctx.lineWidth = 2 * zoom;
        ctx.stroke();
      }

      // ホバーハイライト
      if (isHovered) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r + 3 * zoom, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 2 * zoom;
        ctx.stroke();
      }

      // ラベル
      if (zoom > 0.5 || isHovered) {
        ctx.fillStyle = 'rgba(226,232,240,0.9)';
        ctx.font = `${Math.max(9, 11 * zoom)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(node.nodeLabel, pos.x, pos.y + r + 5 * zoom);
      }
    }

    // 分岐点パルスのためにアニメーション継続
    if (compareData.divergencePoints.length > 0) {
      animFrameRef.current = requestAnimationFrame(draw);
    }
  }, [panX, panY, zoom, hoveredNodeId, compareData]);

  useEffect(() => {
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [draw]);

  useEffect(() => {
    const handleResize = () => {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(draw);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  // マウスイベント
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setDragPanStart({ x: panX, y: panY });
  }, [panX, panY]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setMousePos({ x: e.clientX, y: e.clientY });

    if (isDragging) {
      setPanX(dragPanStart.x + (e.clientX - dragStart.x) / zoom);
      setPanY(dragPanStart.y + (e.clientY - dragStart.y) / zoom);
      return;
    }

    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    let found: string | null = null;
    for (const node of simNodesRef.current) {
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

  const handleMouseUp = useCallback(() => { setIsDragging(false); }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(prev => Math.max(0.3, Math.min(3.0, prev * (e.deltaY > 0 ? 0.9 : 1.1))));
  }, []);

  return (
    <div className="relative w-full h-full bg-slate-900">
      {/* 凡例 */}
      <div className="absolute top-3 left-3 z-10 bg-slate-800/90 backdrop-blur-sm rounded-lg px-3 py-2.5 text-[10px] space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
          <span className="text-slate-300">A: {compareData.userA.taskTitle.slice(0, 20)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
          <span className="text-slate-300">B: {compareData.userB.taskTitle.slice(0, 20)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-purple-500 inline-block border-2 border-purple-300" />
          <span className="text-slate-300">共有ノード ({compareData.sharedNodeIds.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500 inline-block animate-pulse" />
          <span className="text-slate-300">分岐点 ({compareData.divergencePoints.length})</span>
        </div>
      </div>

      {/* 分岐点パネル */}
      {compareData.divergencePoints.length > 0 && (
        <div className="absolute top-3 right-3 z-10 bg-slate-800/90 backdrop-blur-sm rounded-lg px-3 py-2.5 max-w-[240px] max-h-[250px] overflow-y-auto">
          <p className="text-[10px] text-red-400 font-medium mb-1.5">分岐点（認識のズレ）</p>
          {compareData.divergencePoints.map(dp => (
            <div key={dp.nodeId} className="mb-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-xs text-slate-200 font-medium">{dp.nodeLabel}</p>
              <p className="text-[9px] text-slate-400 mt-0.5">
                A → {dp.userANextNodeIds.length}件の異なる方向
              </p>
              <p className="text-[9px] text-slate-400">
                B → {dp.userBNextNodeIds.length}件の異なる方向
              </p>
            </div>
          ))}
        </div>
      )}

      <div ref={containerRef} className="w-full h-full">
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
              {node.owner === 'shared' ? '共有' : node.owner === 'A' ? 'ユーザーA' : 'ユーザーB'}
              {divergenceSet.has(node.nodeId) && <span className="ml-1 text-red-400">· 分岐点</span>}
            </p>
          </div>
        );
      })()}
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

function ThoughtFlowCanvas({ nodes, edges, mode = 'trace', overviewTasks = [], highlightTaskId = null, onHighlightTask, onSelectRelatedTask }: {
  nodes: ThoughtNode[];
  edges: ThoughtEdge[];
  mode?: 'overview' | 'trace';
  overviewTasks?: OverviewTask[];
  highlightTaskId?: string | null;
  onHighlightTask?: (taskId: string | null) => void;
  onSelectRelatedTask?: (task: ThoughtMapTask) => void;
}) {
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
  // Phase 42f残り: 会話モーダル・種化モーダル
  const [showConversationModal, setShowConversationModal] = useState(false);
  const [showSeedModal, setShowSeedModal] = useState(false);
  const [seedCreating, setSeedCreating] = useState(false);
  const [seedCreated, setSeedCreated] = useState(false);

  // Phase 42e: スナップショット
  const [snapshots, setSnapshots] = useState<{
    initialGoal: { id: string; nodeIds: string[]; summary: string; createdAt: string } | null;
    finalLanding: { id: string; nodeIds: string[]; summary: string; createdAt: string } | null;
  }>({ initialGoal: null, finalLanding: null });

  // Phase 42g: 検索
  const [searchQuery, setSearchQuery] = useState('');
  const [relatedTasks, setRelatedTasks] = useState<{
    taskId?: string; seedId?: string; type: 'task' | 'seed'; title: string;
    phase: string; status: string; overlapScore: number;
    matchedNodeLabels: string[]; totalNodeCount: number; createdAt: string;
  }[]>([]);
  const [searchingRelated, setSearchingRelated] = useState(false);

  // Phase 42g: 関連タスク検索
  const fetchRelatedTasks = useCallback(async (nodeId: string, excludeTaskId?: string, excludeSeedId?: string) => {
    setSearchingRelated(true);
    setRelatedTasks([]);
    try {
      const params = new URLSearchParams({ nodeIds: nodeId });
      if (excludeTaskId) params.set('excludeTaskId', excludeTaskId);
      if (excludeSeedId) params.set('excludeSeedId', excludeSeedId);
      params.set('limit', '5');

      const res = await fetch(`/api/nodes/search?${params.toString()}`);
      const json = await res.json();
      if (json.success && json.data?.relatedTasks) {
        setRelatedTasks(json.data.relatedTasks);
      }
    } catch { /* 検索失敗は無視 */ }
    finally { setSearchingRelated(false); }
  }, []);

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

      if (mode === 'overview') {
        // 全体マップ: relatedTaskCount でサイズを変える
        const taskCount = (n as any).relatedTaskCount || 1;
        radius = Math.min(30, 12 + taskCount * 4);
        alpha = 0.85;
        if (taskCount >= 3) {
          glowColor = 'rgba(99,102,241,0.15)';
        }
      } else if (isOnMainRoute) {
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
    // 画面を4エリアに分割: 左上=種, 右上=構想, 右下=進行, 左下=結果
    const zoneColors: Record<string, string> = {
      seed: 'rgba(34,197,94,0.05)',
      ideation: 'rgba(59,130,246,0.05)',
      progress: 'rgba(168,85,247,0.05)',
      result: 'rgba(99,102,241,0.05)',
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

    // ゾーンラベル（各隅に表示）
    for (const [phase, lpos] of Object.entries(zoneLabelPositions)) {
      const pos = worldToScreen(lpos.x, lpos.y, cw, ch, panX, panY, zoom);
      const label = PHASE_LABELS[phase] || phase;
      const phaseColor = PHASE_NODE_COLORS[phase] || 'rgba(99,102,241,0.3)';

      ctx.fillStyle = phaseColor.replace(/[\d.]+\)$/, '0.18)');
      ctx.font = `bold ${Math.max(13, 18 * zoom)}px sans-serif`;
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

      // 矢印（到着先ノード方向）
      const arrowSize = 6 * zoom;
      // ベジェ曲線上の終点付近の角度を計算
      const t = 0.85; // 曲線の85%地点
      const ax = (1-t)*(1-t)*p1.x + 2*(1-t)*t*mx + t*t*p2.x;
      const ay = (1-t)*(1-t)*p1.y + 2*(1-t)*t*my + t*t*p2.y;
      const angle = Math.atan2(p2.y - ay, p2.x - ax);
      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(p2.x - arrowSize * Math.cos(angle - 0.4), p2.y - arrowSize * Math.sin(angle - 0.4));
      ctx.lineTo(p2.x - arrowSize * Math.cos(angle + 0.4), p2.y - arrowSize * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fillStyle = edge.edgeType === 'detour' ? 'rgba(236,72,153,0.35)' : 'rgba(245,158,11,0.6)';
      ctx.fill();
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

      // ノード本体（グラデーション塗り）
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      const nodeGrad = ctx.createRadialGradient(pos.x - r * 0.3, pos.y - r * 0.3, 0, pos.x, pos.y, r);
      nodeGrad.addColorStop(0, 'rgba(255,255,255,0.15)');
      nodeGrad.addColorStop(0.5, node.color);
      nodeGrad.addColorStop(1, node.color);
      ctx.fillStyle = nodeGrad;
      // Phase 42g: 検索フィルタリング（マッチしないノードを薄く表示）
      const searchMatch = !searchQuery || node.nodeLabel.toLowerCase().includes(searchQuery.toLowerCase());
      ctx.globalAlpha = searchMatch ? node.alpha : node.alpha * 0.2;
      ctx.fill();
      ctx.globalAlpha = 1;

      // 薄い輪郭線（常時）
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // ホバー/選択時のハイライト
      if (isHovered || isSelected) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r + 3 * zoom, 0, Math.PI * 2);
        ctx.strokeStyle = isSelected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.6)';
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
        ctx.globalAlpha = searchMatch ? 0.9 : 0.15;
        ctx.fillStyle = searchMatch && searchQuery ? 'rgba(250,204,21,0.95)' : 'rgba(226,232,240,0.9)';
        ctx.font = `${Math.max(9, 11 * zoom)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(node.nodeLabel, pos.x, pos.y + r + 5 * zoom);
        ctx.globalAlpha = 1;
      }
    }
  }, [panX, panY, zoom, currentTime, hoveredNodeId, selectedNodeId, edges, searchQuery]);

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
        setSelectedNodeId(prev => {
          const newId = prev === hoveredNodeId ? null : hoveredNodeId;
          // Phase 42g: ノードクリック時に関連タスク検索
          if (newId) {
            const clickedNode = simNodesRef.current.find(n => n.nodeId === newId);
            if (clickedNode) {
              fetchRelatedTasks(clickedNode.nodeId, clickedNode.taskId, clickedNode.seedId);
            }
          } else {
            setRelatedTasks([]);
          }
          return newId;
        });
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
        {mode === 'trace' && (
          <>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
              <span className="text-slate-300">メインルート</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: PINK_ALPHA }} />
              <span className="text-slate-300">寄り道</span>
            </div>
          </>
        )}
        {mode === 'overview' && (
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-indigo-500/40 inline-block" />
            <span className="text-slate-300">大 = 多くのタスクで使用</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="w-8 h-0.5 bg-amber-500/60 inline-block rounded" />
          <span className="text-slate-300">思考の流れ</span>
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

      {/* 全体マップ: タスクフィルターパネル（右上） */}
      {mode === 'overview' && overviewTasks.length > 0 && (
        <div className="absolute top-14 right-3 z-10 bg-slate-800/90 backdrop-blur-sm rounded-lg px-3 py-2.5 max-w-[220px] max-h-[300px] overflow-y-auto">
          {/* Phase 42g: ノード検索入力 */}
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
            <input
              type="text"
              placeholder="ノード検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-2 py-1 text-xs bg-slate-700/50 border border-slate-600 rounded
                text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <p className="text-[10px] text-slate-500 mb-1.5 font-medium">タスクで絞り込み</p>
          <button
            onClick={() => onHighlightTask?.(null)}
            className={`w-full text-left px-2 py-1 rounded text-xs mb-1 ${
              !highlightTaskId ? 'bg-blue-600/30 text-blue-300' : 'text-slate-400 hover:bg-slate-700'
            }`}
          >
            すべて表示
          </button>
          {overviewTasks.map(t => (
            <button
              key={t.id}
              onClick={() => onHighlightTask?.(highlightTaskId === t.id ? null : t.id)}
              className={`w-full text-left px-2 py-1 rounded text-xs truncate ${
                highlightTaskId === t.id ? 'bg-amber-600/30 text-amber-300' : 'text-slate-400 hover:bg-slate-700'
              }`}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{
                backgroundColor: t.type === 'seed'
                  ? (PHASE_NODE_COLORS.seed || '#22c55e')
                  : (PHASE_NODE_COLORS[t.phase] || '#6366f1'),
              }} />
              {t.title}
            </button>
          ))}
        </div>
      )}

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
              {mode === 'overview' && (node as any).relatedTaskCount > 1 && (
                <span className="ml-1 text-blue-400">· {(node as any).relatedTaskCount}件で使用</span>
              )}
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

              {/* Phase 42f残り: アクションボタン */}
              <div className="mt-4 pt-3 border-t border-slate-700 space-y-2">
                {/* 会話を見るボタン */}
                <button
                  onClick={() => setShowConversationModal(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg
                    bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20
                    transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  会話を見る
                  {!selectedNode.sourceConversationId && (
                    <span className="text-[9px] text-slate-500 ml-auto">時刻で検索</span>
                  )}
                </button>

                {/* 種にするボタン */}
                <button
                  onClick={() => { setSeedCreated(false); setShowSeedModal(true); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg
                    bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20
                    transition-colors"
                >
                  <Sprout className="w-3.5 h-3.5" />
                  このキーワードを種にする
                </button>
              </div>

              {/* Phase 42g: 関連タスク */}
              <div className="mt-4 pt-3 border-t border-slate-700">
                <span className="text-slate-500 flex items-center gap-1">
                  <Search className="w-3 h-3" />
                  関連タスク
                </span>
                <div className="mt-1.5 space-y-1.5">
                  {searchingRelated ? (
                    <div className="flex items-center gap-1.5 text-slate-500 text-[10px]">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      検索中...
                    </div>
                  ) : relatedTasks.length > 0 ? (
                    relatedTasks.map((rt) => (
                      <button
                        key={rt.taskId || rt.seedId}
                        onClick={() => {
                          // 個別トレースに遷移
                          const targetTask: ThoughtMapTask = {
                            id: (rt.taskId || rt.seedId)!,
                            type: rt.type,
                            title: rt.title,
                            phase: rt.phase,
                            status: rt.status,
                            nodeCount: rt.totalNodeCount,
                            edgeCount: 0,
                            createdAt: rt.createdAt,
                            updatedAt: rt.createdAt,
                          };
                          setSelectedNodeId(null);
                          setRelatedTasks([]);
                          onSelectRelatedTask?.(targetTask);
                        }}
                        className="w-full text-left p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600/50
                          border border-slate-600/50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-200 truncate flex-1 mr-2">{rt.title}</span>
                          <span className="text-[10px] text-amber-400 font-medium whitespace-nowrap">
                            {Math.round(rt.overlapScore * 100)}%
                          </span>
                        </div>
                        <div className="text-[9px] text-slate-500 mt-0.5">
                          {rt.type === 'seed' ? '種' : rt.phase} · {rt.matchedNodeLabels.slice(0, 3).join(', ')}
                          {rt.matchedNodeLabels.length > 3 && ` 他${rt.matchedNodeLabels.length - 3}件`}
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="text-[10px] text-slate-600">関連タスクなし</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Phase 42e: スナップショット比較パネル */}
        {(snapshots.initialGoal || snapshots.finalLanding) && (
          <div className="absolute bottom-4 left-4 right-4 bg-slate-800/95 backdrop-blur-sm border border-slate-600 rounded-xl p-4 z-20 max-h-48 overflow-y-auto">
            <h4 className="text-xs font-bold text-slate-300 mb-3 flex items-center gap-1.5">
              <Circle className="w-3 h-3 text-amber-400" />
              スナップショット比較
            </h4>
            <div className="grid grid-cols-2 gap-3">
              {/* 初期ゴール */}
              <div className="bg-slate-700/50 rounded-lg p-3 border border-blue-500/20">
                <div className="text-[10px] font-medium text-blue-400 mb-1.5">
                  出口想定（タスク作成時）
                </div>
                {snapshots.initialGoal ? (
                  <>
                    <p className="text-xs text-slate-300 whitespace-pre-wrap line-clamp-4">
                      {snapshots.initialGoal.summary}
                    </p>
                    <p className="text-[9px] text-slate-500 mt-1.5">
                      {new Date(snapshots.initialGoal.createdAt).toLocaleString('ja-JP')}
                      {' · '}ノード {snapshots.initialGoal.nodeIds.length}件
                    </p>
                  </>
                ) : (
                  <p className="text-[10px] text-slate-500">記録なし</p>
                )}
              </div>

              {/* 着地点 */}
              <div className="bg-slate-700/50 rounded-lg p-3 border border-purple-500/20">
                <div className="text-[10px] font-medium text-purple-400 mb-1.5">
                  着地点（タスク完了時）
                </div>
                {snapshots.finalLanding ? (
                  <>
                    <p className="text-xs text-slate-300 whitespace-pre-wrap line-clamp-4">
                      {snapshots.finalLanding.summary}
                    </p>
                    <p className="text-[9px] text-slate-500 mt-1.5">
                      {new Date(snapshots.finalLanding.createdAt).toLocaleString('ja-JP')}
                      {' · '}ノード {snapshots.finalLanding.nodeIds.length}件
                    </p>
                  </>
                ) : (
                  <p className="text-[10px] text-slate-500">タスク未完了</p>
                )}
              </div>
            </div>

            {/* ノード差分表示 */}
            {snapshots.initialGoal && snapshots.finalLanding && (
              <div className="mt-2 pt-2 border-t border-slate-700">
                <div className="text-[10px] text-slate-400">
                  {(() => {
                    const initial = new Set(snapshots.initialGoal!.nodeIds);
                    const final_ = new Set(snapshots.finalLanding!.nodeIds);
                    const added = [...final_].filter(id => !initial.has(id)).length;
                    const removed = [...initial].filter(id => !final_.has(id)).length;
                    const kept = [...initial].filter(id => final_.has(id)).length;
                    return `継続: ${kept}件 · 追加: +${added}件 · 初期のみ: -${removed}件`;
                  })()}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Phase 42f残り: 会話モーダル */}
      {selectedNode && (
        <ConversationModal
          isOpen={showConversationModal}
          onClose={() => setShowConversationModal(false)}
          sourceConversationId={selectedNode.sourceConversationId || null}
          nodeLabel={selectedNode.nodeLabel}
          seedId={selectedNode.seedId}
          taskId={selectedNode.taskId}
          createdAt={selectedNode.createdAt}
        />
      )}

      {/* Phase 42f残り: 種作成確認モーダル */}
      {showSeedModal && selectedNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-600 rounded-xl w-full max-w-md p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Sprout className="w-4 h-4 text-emerald-400" />
                種を作成
              </h3>
              <button
                onClick={() => setShowSeedModal(false)}
                className="p-1 rounded hover:bg-slate-700 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {seedCreated ? (
              <div className="text-center py-4">
                <p className="text-emerald-400 text-sm font-medium">種を作成しました！</p>
                <p className="text-slate-400 text-xs mt-1">種ボックスで確認できます。</p>
                <button
                  onClick={() => setShowSeedModal(false)}
                  className="mt-4 px-4 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-200"
                >
                  閉じる
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-3 text-xs">
                  <div>
                    <span className="text-slate-500">キーワード</span>
                    <p className="text-slate-200 mt-0.5 text-sm font-medium">{selectedNode.nodeLabel}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">元のフェーズ</span>
                    <p className="text-slate-200 mt-0.5">
                      {PHASE_LABELS[selectedNode.appearPhase] || selectedNode.appearPhase}
                    </p>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <p className="text-slate-400 text-[11px]">
                      思考マップ上の「{selectedNode.nodeLabel}」を新しい種として登録します。
                      元の文脈を含めて種ボックスに追加されます。
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => setShowSeedModal(false)}
                    className="flex-1 px-3 py-2 text-xs bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-200"
                  >
                    キャンセル
                  </button>
                  <button
                    disabled={seedCreating}
                    onClick={async () => {
                      setSeedCreating(true);
                      try {
                        const content = `【思考マップから】${selectedNode.nodeLabel}\n\n元のフェーズ: ${PHASE_LABELS[selectedNode.appearPhase] || selectedNode.appearPhase}\n記録日時: ${new Date(selectedNode.createdAt).toLocaleString('ja-JP')}`;
                        const res = await fetch('/api/seeds', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ content }),
                        });
                        const json = await res.json();
                        if (json.success) {
                          setSeedCreated(true);
                        } else {
                          alert('種の作成に失敗しました: ' + (json.error || '不明なエラー'));
                        }
                      } catch {
                        alert('通信エラーが発生しました');
                      } finally {
                        setSeedCreating(false);
                      }
                    }}
                    className="flex-1 px-3 py-2 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600
                      rounded-lg text-white font-medium flex items-center justify-center gap-1"
                  >
                    {seedCreating ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /> 作成中...</>
                    ) : (
                      '種を作成'
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
