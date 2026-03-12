// v5.0: 検討ツリー画面のタスク提案パネル
// 会議録AI解析で生成されたタスク提案を表示し、その場で承認・編集・却下できる
// - メンバー名正しく表示、優先度・期限編集可能、複数人割り当て（タスク複製）対応
'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, X, User, Calendar, Loader2, ListTodo, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProposalItem {
  title: string;
  assignee: string;
  assigneeContactId?: string | null;
  context?: string;
  due_date?: string | null;
  priority: string;
  related_topic?: string;
  related_topics?: string[];
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

interface EditedItem {
  title: string;
  assigneeContactId: string;
  priority: string;
  dueDate: string;
  context: string;
  selected: boolean;
}

interface SuggestionState {
  items: EditedItem[];
  milestoneId: string;
  submitting: boolean;
  submitted: boolean;
  dismissed: boolean;
  expandedContext: Set<number>;
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
  const [editState, setEditState] = useState<Record<string, SuggestionState>>({});

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
          const state: Record<string, SuggestionState> = {};
          data.data.forEach((s: TaskSuggestion) => {
            state[s.id] = {
              items: s.suggestions.items.map((item: ProposalItem) => ({
                title: item.title,
                assigneeContactId: item.assigneeContactId || '',
                priority: item.priority || 'medium',
                dueDate: item.due_date || '',
                context: item.context || '',
                selected: true,
              })),
              milestoneId: '',
              submitting: false,
              submitted: false,
              dismissed: false,
              expandedContext: new Set(),
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
          // APIレスポンス: { contact_id, contact: { id, name, ... } }
          setMembers(data.data.map((m: { contact_id: string; contact?: { name: string } }) => ({
            contact_id: m.contact_id,
            name: m.contact?.name || '不明',
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

  // アイテム編集ヘルパー
  const updateItem = (suggestionId: string, index: number, updates: Partial<EditedItem>) => {
    setEditState(prev => {
      const state = prev[suggestionId];
      if (!state) return prev;
      const newItems = [...state.items];
      newItems[index] = { ...newItems[index], ...updates };
      return { ...prev, [suggestionId]: { ...state, items: newItems } };
    });
  };

  // コンテキスト展開/折りたたみ
  const toggleContext = (suggestionId: string, index: number) => {
    setEditState(prev => {
      const state = prev[suggestionId];
      if (!state) return prev;
      const next = new Set(state.expandedContext);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return { ...prev, [suggestionId]: { ...state, expandedContext: next } };
    });
  };

  // タスクを複製（複数人割り当て用）
  const duplicateItem = (suggestionId: string, index: number) => {
    setEditState(prev => {
      const state = prev[suggestionId];
      if (!state) return prev;
      const source = state.items[index];
      const newItem: EditedItem = {
        ...source,
        assigneeContactId: '', // 担当者は空にして選択させる
        selected: true,
      };
      const newItems = [...state.items];
      newItems.splice(index + 1, 0, newItem);
      return { ...prev, [suggestionId]: { ...state, items: newItems } };
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

  // 提案の承認
  const handleApprove = async (suggestionId: string) => {
    const state = editState[suggestionId];
    if (!state || state.submitting) return;

    const selectedItems = state.items.filter(item => item.selected);
    if (selectedItems.length === 0) return;

    setEditState(prev => ({
      ...prev,
      [suggestionId]: { ...prev[suggestionId], submitting: true },
    }));

    try {
      let createdCount = 0;
      for (const item of selectedItems) {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: item.title,
            description: item.context || '',
            priority: item.priority || 'medium',
            projectId: projectId,
            milestoneId: state.milestoneId || undefined,
            dueDate: item.dueDate || undefined,
            assigneeContactId: item.assigneeContactId || undefined,
            taskType: item.assigneeContactId ? 'group' : 'personal',
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

  // 表示するべき提案がない場合
  const visibleSuggestions = suggestions.filter(s => {
    const state = editState[s.id];
    return state && !state.submitted && !state.dismissed;
  });

  if (loading) return null;
  if (visibleSuggestions.length === 0) return null;

  const priorityOptions = [
    { value: 'high', label: '高', color: 'text-red-600 bg-red-50 border-red-200' },
    { value: 'medium', label: '中', color: 'text-amber-700 bg-amber-50 border-amber-200' },
    { value: 'low', label: '低', color: 'text-slate-600 bg-slate-100 border-slate-200' },
  ];

  // メンバー名取得ヘルパー
  const getMemberName = (contactId: string) => {
    const m = members.find(m => m.contact_id === contactId);
    return m?.name || '';
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
        const selectedCount = state.items.filter(item => item.selected).length;

        return (
          <div key={suggestion.id} className="border border-blue-200 bg-blue-50/30 rounded-lg overflow-hidden">
            {/* ヘッダー */}
            <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">
                  「{suggestion.suggestions.meetingTitle || suggestion.meeting_title}」からの提案（{state.items.length}件）
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
            <div className="p-4 space-y-3">
              {state.items.map((item, i) => (
                <div
                  key={i}
                  className={cn(
                    'p-3 rounded-lg border transition-colors',
                    item.selected
                      ? 'border-blue-200 bg-white'
                      : 'border-slate-200 bg-slate-50 opacity-50'
                  )}
                >
                  {/* 1行目: チェック + タイトル + 複製ボタン */}
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => updateItem(suggestion.id, i, { selected: !item.selected })}
                      className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) => updateItem(suggestion.id, i, { title: e.target.value })}
                      className="flex-1 text-sm font-medium text-slate-800 bg-transparent border-none p-0 focus:ring-0 focus:outline-none"
                    />
                    <button
                      onClick={() => duplicateItem(suggestion.id, i)}
                      className="p-1 text-slate-300 hover:text-blue-500 transition-colors shrink-0"
                      title="同じタスクを別の人にも割り当て"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* コンテキスト（展開/折りたたみ） */}
                  {item.context && (
                    <div className="ml-8 mt-2">
                      <button
                        onClick={() => toggleContext(suggestion.id, i)}
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {state.expandedContext.has(i) ? (
                          <><ChevronUp className="w-3 h-3" />背景を閉じる</>
                        ) : (
                          <><ChevronDown className="w-3 h-3" />背景を見る</>
                        )}
                      </button>
                      {state.expandedContext.has(i) && (
                        <p className="mt-1 text-xs text-slate-500 leading-relaxed bg-slate-50 rounded p-2">
                          {item.context}
                        </p>
                      )}
                    </div>
                  )}

                  {/* 2行目: 担当者 + 優先度 + 期限 + 関連トピック */}
                  <div className="ml-8 mt-2 flex items-center gap-3 flex-wrap">
                    {/* 担当者セレクト */}
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" />
                      <select
                        value={item.assigneeContactId}
                        onChange={(e) => updateItem(suggestion.id, i, { assigneeContactId: e.target.value })}
                        className="text-xs bg-transparent border border-slate-200 rounded px-1.5 py-0.5 focus:border-blue-400 focus:outline-none"
                      >
                        <option value="">未割り当て</option>
                        {members.map(m => (
                          <option key={m.contact_id} value={m.contact_id}>{m.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* 優先度セレクト */}
                    <select
                      value={item.priority}
                      onChange={(e) => updateItem(suggestion.id, i, { priority: e.target.value })}
                      className={cn(
                        'text-xs rounded px-1.5 py-0.5 border focus:outline-none',
                        priorityOptions.find(p => p.value === item.priority)?.color || ''
                      )}
                    >
                      {priorityOptions.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>

                    {/* 期限（日付ピッカー） */}
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <input
                        type="date"
                        value={item.dueDate}
                        onChange={(e) => updateItem(suggestion.id, i, { dueDate: e.target.value })}
                        className="text-xs border border-slate-200 rounded px-1.5 py-0.5 bg-transparent focus:border-blue-400 focus:outline-none"
                      />
                    </div>

                    {/* 関連トピック */}
                    {(() => {
                      const origItem = suggestion.suggestions.items[i];
                      const topics = origItem?.related_topics || (origItem?.related_topic ? [origItem.related_topic] : []);
                      return topics.length > 0 ? (
                        <span className="text-xs text-slate-400">← {topics.join(', ')}</span>
                      ) : null;
                    })()}
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
                disabled={state.submitting || selectedCount === 0}
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
                    {selectedCount}件をタスク作成
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
