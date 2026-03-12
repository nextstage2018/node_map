// v5.0: 検討ツリー画面のタスク提案パネル
// 会議録AI解析で生成されたタスク提案を表示し、その場で承認・編集・却下できる
'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, X, User, Calendar, ChevronDown, Loader2, ListTodo } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProposalItem {
  title: string;
  assignee: string;
  assigneeContactId?: string | null;
  due_date?: string | null;
  priority: string;
  related_topic?: string;
}

interface TaskSuggestion {
  id: string;
  meeting_title?: string;
  created_at: string;
  suggestions: {
    meetingTitle?: string;
    meetingDate?: string;
    projectId?: string;
    items: ProposalItem[];
  };
}

interface Milestone {
  id: string;
  title: string;
  status: string;
}

interface Member {
  contact_id: string;
  name: string;
}

interface TaskProposalPanelProps {
  projectId: string;
  refreshKey?: number;
}

export default function TaskProposalPanel({ projectId, refreshKey }: TaskProposalPanelProps) {
  const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // 各提案の状態管理
  const [editState, setEditState] = useState<Record<string, {
    selectedItems: Set<number>;
    editedTitles: Record<number, string>;
    editedAssignees: Record<number, string>;
    milestoneId: string;
    submitting: boolean;
    submitted: boolean;
    dismissed: boolean;
  }>>({});

  // データ取得
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sugRes, msRes, memRes] = await Promise.all([
        fetch(`/api/task-suggestions/pending?project_id=${projectId}`),
        fetch(`/api/milestones?project_id=${projectId}`),
        fetch(`/api/projects/${projectId}/members`),
      ]);

      if (sugRes.ok) {
        const data = await sugRes.json();
        if (data.success && data.data) {
          setSuggestions(data.data);
          // 初期状態セット
          const state: typeof editState = {};
          data.data.forEach((s: TaskSuggestion) => {
            state[s.id] = {
              selectedItems: new Set(s.suggestions.items.map((_: ProposalItem, i: number) => i)),
              editedTitles: {},
              editedAssignees: {},
              milestoneId: '',
              submitting: false,
              submitted: false,
              dismissed: false,
            };
          });
          setEditState(state);
        }
      }

      if (msRes.ok) {
        const data = await msRes.json();
        if (data.success || data.data) {
          const msList = (data.data || []).filter((m: Milestone) => m.status !== 'achieved' && m.status !== 'missed');
          setMilestones(msList);
        }
      }

      if (memRes.ok) {
        const data = await memRes.json();
        if (data.success && data.data) {
          setMembers(data.data.map((m: { contact_id: string; contact_persons?: { name: string } }) => ({
            contact_id: m.contact_id,
            name: m.contact_persons?.name || '不明',
          })));
        }
      }
    } catch (error) {
      console.error('タスク提案取得エラー:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  // 提案の承認
  const handleApprove = async (suggestionId: string) => {
    const state = editState[suggestionId];
    if (!state || state.submitting || state.selectedItems.size === 0) return;

    setEditState(prev => ({
      ...prev,
      [suggestionId]: { ...prev[suggestionId], submitting: true },
    }));

    const suggestion = suggestions.find(s => s.id === suggestionId);
    if (!suggestion) return;

    try {
      let createdCount = 0;
      const selectedItemsList = suggestion.suggestions.items.filter((_, i) => state.selectedItems.has(i));

      for (const [idx, item] of selectedItemsList.entries()) {
        const originalIdx = suggestion.suggestions.items.indexOf(item);
        const assigneeContactId = state.editedAssignees[originalIdx] || item.assigneeContactId;

        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: state.editedTitles[originalIdx] || item.title,
            priority: item.priority || 'medium',
            projectId: projectId,
            milestoneId: state.milestoneId || undefined,
            dueDate: item.due_date || undefined,
            assigneeContactId: assigneeContactId || undefined,
            taskType: assigneeContactId ? 'group' : 'personal',
          }),
        });
        const result = await res.json();
        if (result.success) createdCount++;
      }

      // task_suggestions を accepted に更新
      await fetch(`/api/task-suggestions/${suggestionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'accepted' }),
      });

      setEditState(prev => ({
        ...prev,
        [suggestionId]: { ...prev[suggestionId], submitting: false, submitted: true },
      }));
    } catch (error) {
      console.error('タスク作成エラー:', error);
      setEditState(prev => ({
        ...prev,
        [suggestionId]: { ...prev[suggestionId], submitting: false },
      }));
    }
  };

  // 提案の却下
  const handleDismiss = async (suggestionId: string) => {
    try {
      await fetch(`/api/task-suggestions/${suggestionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed' }),
      });
      setEditState(prev => ({
        ...prev,
        [suggestionId]: { ...prev[suggestionId], dismissed: true },
      }));
    } catch (error) {
      console.error('却下エラー:', error);
    }
  };

  // チェックボックス切替
  const toggleItem = (suggestionId: string, index: number) => {
    setEditState(prev => {
      const state = prev[suggestionId];
      if (!state) return prev;
      const next = new Set(state.selectedItems);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return { ...prev, [suggestionId]: { ...state, selectedItems: next } };
    });
  };

  // タイトル編集
  const updateTitle = (suggestionId: string, index: number, title: string) => {
    setEditState(prev => {
      const state = prev[suggestionId];
      if (!state) return prev;
      return { ...prev, [suggestionId]: { ...state, editedTitles: { ...state.editedTitles, [index]: title } } };
    });
  };

  // 担当者変更
  const updateAssignee = (suggestionId: string, index: number, contactId: string) => {
    setEditState(prev => {
      const state = prev[suggestionId];
      if (!state) return prev;
      return { ...prev, [suggestionId]: { ...state, editedAssignees: { ...state.editedAssignees, [index]: contactId } } };
    });
  };

  // マイルストーン変更
  const updateMilestone = (suggestionId: string, milestoneId: string) => {
    setEditState(prev => {
      const state = prev[suggestionId];
      if (!state) return prev;
      return { ...prev, [suggestionId]: { ...state, milestoneId } };
    });
  };

  // 表示するべき提案がない場合
  const visibleSuggestions = suggestions.filter(s => {
    const state = editState[s.id];
    return state && !state.submitted && !state.dismissed;
  });

  if (loading) return null;
  if (visibleSuggestions.length === 0) return null;

  const priorityLabel: Record<string, string> = { high: '高', medium: '中', low: '低' };
  const priorityColor: Record<string, string> = {
    high: 'text-red-600 bg-red-50',
    medium: 'text-amber-700 bg-amber-50',
    low: 'text-slate-600 bg-slate-100',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ListTodo className="w-4 h-4 text-blue-500" />
        <h3 className="text-sm font-bold text-slate-800">タスク提案</h3>
        <span className="text-xs text-slate-400">会議録から自動生成</span>
      </div>

      {visibleSuggestions.map(suggestion => {
        const state = editState[suggestion.id];
        if (!state) return null;

        return (
          <div key={suggestion.id} className="border border-blue-200 bg-blue-50/30 rounded-lg overflow-hidden">
            {/* ヘッダー */}
            <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">
                  「{suggestion.suggestions.meetingTitle || suggestion.meeting_title}」からの提案（{suggestion.suggestions.items.length}件）
                </p>
                <button
                  onClick={() => handleDismiss(suggestion.id)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                  title="却下"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* アイテム一覧 */}
            <div className="p-4 space-y-2">
              {suggestion.suggestions.items.map((item, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg border transition-colors',
                    state.selectedItems.has(i)
                      ? 'border-blue-200 bg-white'
                      : 'border-slate-200 bg-slate-50 opacity-50'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={state.selectedItems.has(i)}
                    onChange={() => toggleItem(suggestion.id, i)}
                    className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* タイトル（編集可能） */}
                    <input
                      type="text"
                      value={state.editedTitles[i] !== undefined ? state.editedTitles[i] : item.title}
                      onChange={(e) => updateTitle(suggestion.id, i, e.target.value)}
                      className="w-full text-sm font-medium text-slate-800 bg-transparent border-none p-0 focus:ring-0 focus:outline-none"
                    />

                    {/* 担当者 + 優先度 + 期限 */}
                    <div className="flex items-center gap-3 flex-wrap">
                      {/* 担当者セレクト */}
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-400" />
                        <select
                          value={state.editedAssignees[i] || item.assigneeContactId || ''}
                          onChange={(e) => updateAssignee(suggestion.id, i, e.target.value)}
                          className="text-xs bg-transparent border border-slate-200 rounded px-1.5 py-0.5 focus:border-blue-400 focus:outline-none"
                        >
                          <option value="">未割り当て</option>
                          {members.map(m => (
                            <option key={m.contact_id} value={m.contact_id}>{m.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* 優先度 */}
                      <span className={cn('text-xs px-1.5 py-0.5 rounded', priorityColor[item.priority] || '')}>
                        {priorityLabel[item.priority] || item.priority}
                      </span>

                      {/* 期限 */}
                      {item.due_date && (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <Calendar className="w-3 h-3" />
                          {item.due_date}
                        </span>
                      )}

                      {/* 関連トピック */}
                      {item.related_topic && (
                        <span className="text-xs text-slate-400">← {item.related_topic}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* フッター: マイルストーン + ボタン */}
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center gap-3 flex-wrap">
              {milestones.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500">MS:</label>
                  <select
                    value={state.milestoneId}
                    onChange={(e) => updateMilestone(suggestion.id, e.target.value)}
                    className="text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:border-blue-400 focus:outline-none"
                  >
                    <option value="">なし</option>
                    {milestones.map(ms => (
                      <option key={ms.id} value={ms.id}>{ms.title}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex-1" />

              <button
                onClick={() => handleDismiss(suggestion.id)}
                className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
              >
                スキップ
              </button>
              <button
                onClick={() => handleApprove(suggestion.id)}
                disabled={state.submitting || state.selectedItems.size === 0}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {state.submitting ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    作成中...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3 h-3" />
                    {state.selectedItems.size}件をタスク作成
                  </>
                )}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
