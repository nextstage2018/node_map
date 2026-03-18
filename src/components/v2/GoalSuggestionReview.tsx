// v4.0-Phase5: ゴール提案レビュー＆承認UIコンポーネント
// AI解析で生成された goal_suggestions をプレビューし、一括承認 or 個別編集 → 確定
'use client';

import { useState } from 'react';
import {
  Target,
  Flag,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Loader2,
  Check,
  X,
  Pencil,
  Trash2,
} from 'lucide-react';

// ========================================
// 型定義
// ========================================
interface TaskSuggestion {
  title: string;
  assignee_hint: string;
  due_date: string | null;
  priority: 'high' | 'medium' | 'low';
}

interface MilestoneSuggestion {
  title: string;
  target_date: string | null;
  tasks: TaskSuggestion[];
}

interface GoalSuggestion {
  title: string;
  description: string;
  milestones: MilestoneSuggestion[];
}

interface GoalSuggestionReviewProps {
  projectId: string;
  meetingRecordId?: string;
  suggestions: GoalSuggestion[];
  onComplete?: () => void;
  onDismiss?: () => void;
}

// ========================================
// 優先度バッジ
// ========================================
function PriorityBadge({ priority }: { priority: string }) {
  const colors = {
    high: 'bg-red-50 text-red-700 border-red-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    low: 'bg-slate-50 text-slate-600 border-slate-200',
  };
  const labels = { high: '高', medium: '中', low: '低' };
  return (
    <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded border ${colors[priority as keyof typeof colors] || colors.medium}`}>
      {labels[priority as keyof typeof labels] || priority}
    </span>
  );
}

// ========================================
// メインコンポーネント
// ========================================
export default function GoalSuggestionReview({
  projectId,
  meetingRecordId,
  suggestions: initialSuggestions,
  onComplete,
  onDismiss,
}: GoalSuggestionReviewProps) {
  const [suggestions, setSuggestions] = useState<GoalSuggestion[]>(initialSuggestions);
  const [expandedGoals, setExpandedGoals] = useState<Set<number>>(
    new Set(initialSuggestions.map((_, i) => i))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ goals: number; milestones: number; tasks: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 編集中のアイテム
  const [editingGoal, setEditingGoal] = useState<number | null>(null);
  const [editingMs, setEditingMs] = useState<string | null>(null); // "goalIdx-msIdx"
  const [editTitle, setEditTitle] = useState('');

  // ゴールの展開/折りたたみ
  const toggleGoal = (idx: number) => {
    setExpandedGoals(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // ゴール削除
  const removeGoal = (goalIdx: number) => {
    setSuggestions(prev => prev.filter((_, i) => i !== goalIdx));
  };

  // マイルストーン削除
  const removeMs = (goalIdx: number, msIdx: number) => {
    setSuggestions(prev => prev.map((g, gi) =>
      gi === goalIdx
        ? { ...g, milestones: g.milestones.filter((_, mi) => mi !== msIdx) }
        : g
    ));
  };

  // タスク削除
  const removeTask = (goalIdx: number, msIdx: number, taskIdx: number) => {
    setSuggestions(prev => prev.map((g, gi) =>
      gi === goalIdx
        ? {
            ...g,
            milestones: g.milestones.map((ms, mi) =>
              mi === msIdx
                ? { ...ms, tasks: ms.tasks.filter((_, ti) => ti !== taskIdx) }
                : ms
            ),
          }
        : g
    ));
  };

  // ゴール名編集
  const startEditGoal = (goalIdx: number) => {
    setEditingGoal(goalIdx);
    setEditTitle(suggestions[goalIdx].title);
  };

  const saveEditGoal = () => {
    if (editingGoal === null || !editTitle.trim()) return;
    setSuggestions(prev => prev.map((g, i) =>
      i === editingGoal ? { ...g, title: editTitle.trim() } : g
    ));
    setEditingGoal(null);
    setEditTitle('');
  };

  // MS名編集
  const startEditMs = (goalIdx: number, msIdx: number) => {
    setEditingMs(`${goalIdx}-${msIdx}`);
    setEditTitle(suggestions[goalIdx].milestones[msIdx].title);
  };

  const saveEditMs = (goalIdx: number, msIdx: number) => {
    if (!editTitle.trim()) return;
    setSuggestions(prev => prev.map((g, gi) =>
      gi === goalIdx
        ? {
            ...g,
            milestones: g.milestones.map((ms, mi) =>
              mi === msIdx ? { ...ms, title: editTitle.trim() } : ms
            ),
          }
        : g
    ));
    setEditingMs(null);
    setEditTitle('');
  };

  // 一括承認
  const handleApprove = async () => {
    // 空のゴールを除外
    const validGoals = suggestions.filter(g => g.milestones.length > 0 || g.title.trim());
    if (validGoals.length === 0) {
      setError('承認するゴールがありません');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/goals/batch-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          meeting_record_id: meetingRecordId,
          goals: validGoals,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || '一括作成に失敗しました');
      }

      setResult({
        goals: data.data.goals_created,
        milestones: data.data.milestones_created,
        tasks: data.data.tasks_created,
      });
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '一括作成に失敗しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 合計数の計算
  const totalMs = suggestions.reduce((sum, g) => sum + g.milestones.length, 0);
  const totalTasks = suggestions.reduce(
    (sum, g) => sum + g.milestones.reduce((s, ms) => s + ms.tasks.length, 0),
    0
  );

  // 完了表示
  if (result) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Check className="w-4 h-4 text-green-600" />
          <span className="text-sm font-bold text-green-800">階層構造を作成しました</span>
        </div>
        <p className="text-xs text-green-700">
          ゴール {result.goals}件 / マイルストーン {result.milestones}件 / タスク {result.tasks}件
        </p>
      </div>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-bold text-blue-800">
            AIが提案するプロジェクト構造
          </span>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
          title="提案を閉じる"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs text-blue-700 mb-3">
        {suggestions.length}ゴール / {totalMs}マイルストーン / {totalTasks}タスク が提案されています。
        内容を確認・編集してから一括承認してください。
      </p>

      {/* ゴール一覧 */}
      <div className="space-y-2 mb-4">
        {suggestions.map((goal, goalIdx) => (
          <div key={goalIdx} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            {/* ゴールヘッダー */}
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
              <button
                onClick={() => toggleGoal(goalIdx)}
                className="p-0.5 text-slate-500 hover:text-slate-700"
              >
                {expandedGoals.has(goalIdx) ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>
              <Target className="w-3.5 h-3.5 text-blue-600" />

              {editingGoal === goalIdx ? (
                <div className="flex items-center gap-1 flex-1">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="flex-1 px-2 py-0.5 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') saveEditGoal(); if (e.key === 'Escape') setEditingGoal(null); }}
                  />
                  <button onClick={saveEditGoal} className="p-0.5 text-green-600 hover:text-green-800">
                    <Check className="w-3 h-3" />
                  </button>
                  <button onClick={() => setEditingGoal(null)} className="p-0.5 text-slate-400 hover:text-slate-600">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <>
                  <span className="text-xs font-bold text-slate-800 flex-1">{goal.title}</span>
                  <button onClick={() => startEditGoal(goalIdx)} className="p-0.5 text-slate-400 hover:text-blue-600">
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button onClick={() => removeGoal(goalIdx)} className="p-0.5 text-slate-400 hover:text-red-600">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>

            {/* ゴール展開部分 */}
            {expandedGoals.has(goalIdx) && (
              <div className="px-3 py-2">
                {goal.description && (
                  <p className="text-[11px] text-slate-500 mb-2">{goal.description}</p>
                )}

                {/* マイルストーン一覧 */}
                <div className="space-y-2 ml-3">
                  {goal.milestones.map((ms, msIdx) => (
                    <div key={msIdx} className="border-l-2 border-blue-200 pl-3">
                      {/* MS ヘッダー */}
                      <div className="flex items-center gap-1.5 mb-1">
                        <Flag className="w-3 h-3 text-amber-600" />
                        {editingMs === `${goalIdx}-${msIdx}` ? (
                          <div className="flex items-center gap-1 flex-1">
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="flex-1 px-2 py-0.5 text-[11px] border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              autoFocus
                              onKeyDown={(e) => { if (e.key === 'Enter') saveEditMs(goalIdx, msIdx); if (e.key === 'Escape') setEditingMs(null); }}
                            />
                            <button onClick={() => saveEditMs(goalIdx, msIdx)} className="p-0.5 text-green-600">
                              <Check className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="text-[11px] font-semibold text-slate-700 flex-1">{ms.title}</span>
                            {ms.target_date && (
                              <span className="text-[10px] text-slate-400">{ms.target_date}</span>
                            )}
                            <button onClick={() => startEditMs(goalIdx, msIdx)} className="p-0.5 text-slate-300 hover:text-blue-600">
                              <Pencil className="w-2.5 h-2.5" />
                            </button>
                            <button onClick={() => removeMs(goalIdx, msIdx)} className="p-0.5 text-slate-300 hover:text-red-600">
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          </>
                        )}
                      </div>

                      {/* タスク一覧 */}
                      <div className="space-y-1 ml-4">
                        {ms.tasks.map((task, taskIdx) => (
                          <div key={taskIdx} className="flex items-center gap-1.5 group">
                            <CheckSquare className="w-2.5 h-2.5 text-slate-400" />
                            <span className="text-[11px] text-slate-600 flex-1">{task.title}</span>
                            <PriorityBadge priority={task.priority} />
                            {task.due_date && (
                              <span className="text-[10px] text-slate-400">{task.due_date}</span>
                            )}
                            {task.assignee_hint && (
                              <span className="text-[10px] text-slate-400">@{task.assignee_hint}</span>
                            )}
                            <button
                              onClick={() => removeTask(goalIdx, msIdx, taskIdx)}
                              className="p-0.5 text-slate-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="px-3 py-2 mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
          {error}
        </div>
      )}

      {/* アクションボタン */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onDismiss}
          disabled={isSubmitting}
          className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          スキップ
        </button>
        <button
          onClick={handleApprove}
          disabled={isSubmitting || suggestions.length === 0}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              作成中...
            </>
          ) : (
            <>
              <Check className="w-3.5 h-3.5" />
              一括承認して作成
            </>
          )}
        </button>
      </div>
    </div>
  );
}
