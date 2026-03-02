'use client';

import { useState, useEffect } from 'react';
import { TaskPriority, TaskCategory, RecurrenceType, CreateTaskRequest } from '@/lib/types';
import { TASK_PRIORITY_CONFIG } from '@/lib/constants';
import Button from '@/components/ui/Button';

interface Project {
  id: string;
  name: string;
  organizationName?: string;
}

interface ParentTaskOption {
  id: string;
  title: string;
}

interface ContactOption {
  id: string;
  name: string;
  companyName?: string;
}

const CATEGORY_CONFIG: Record<TaskCategory, { label: string; description: string }> = {
  routine: { label: '定型', description: 'テンプレートから生成、繰り返しあり' },
  individual: { label: '個別', description: '個人的なタスク' },
  team: { label: 'チーム', description: '複数人で取り組むタスク' },
};

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

interface CreateTaskModalProps {
  onClose: () => void;
  onCreate: (req: CreateTaskRequest) => Promise<void>;
}

export default function CreateTaskModal({ onClose, onCreate }: CreateTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [tags, setTags] = useState('');
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Phase 50: 新フィールド
  const [taskCategory, setTaskCategory] = useState<TaskCategory>('individual');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [recurrenceType, setRecurrenceType] = useState<string>('');
  const [recurrenceDay, setRecurrenceDay] = useState<string>('');
  const [parentTaskId, setParentTaskId] = useState('');
  const [parentTasks, setParentTasks] = useState<ParentTaskOption[]>([]);
  const [assigneeContactId, setAssigneeContactId] = useState('');
  const [contacts, setContacts] = useState<ContactOption[]>([]);

  // プロジェクト一覧を取得
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/projects?status=active');
        const data = await res.json();
        if (data.success) {
          setProjects(data.data || []);
        }
      } catch {
        // サイレント
      } finally {
        setIsLoadingProjects(false);
      }
    })();
  }, []);

  // チームタスク時: 親タスク候補 + コンタクト一覧を取得
  useEffect(() => {
    if (taskCategory === 'team') {
      // 親タスク候補（同じプロジェクトの未完了タスク）
      (async () => {
        try {
          const res = await fetch('/api/tasks');
          const data = await res.json();
          if (data.success) {
            const filtered = (data.data || [])
              .filter((t: any) => t.status !== 'done' && (!projectId || t.project_id === projectId))
              .map((t: any) => ({ id: t.id, title: t.title }));
            setParentTasks(filtered);
          }
        } catch { /* silent */ }
      })();
      // コンタクト一覧
      (async () => {
        try {
          const res = await fetch('/api/contacts');
          const data = await res.json();
          if (data.success) {
            setContacts(
              (data.data || []).map((c: any) => ({
                id: c.id,
                name: c.display_name || c.name || 'Unknown',
                companyName: c.company_name,
              }))
            );
          }
        } catch { /* silent */ }
      })();
    }
  }, [taskCategory, projectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !projectId) return;

    setIsSubmitting(true);
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim(),
        priority,
        projectId,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        taskCategory,
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : undefined,
        recurrenceType: (recurrenceType as RecurrenceType) || undefined,
        recurrenceDay: recurrenceDay ? parseInt(recurrenceDay) : undefined,
        parentTaskId: parentTaskId || undefined,
        assigneeContactId: assigneeContactId || undefined,
      });
      onClose();
    } catch {
      // エラーは親で処理
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">新しいタスク</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* タスクの種類 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              タスクの種類
            </label>
            <div className="flex gap-2">
              {(Object.keys(CATEGORY_CONFIG) as TaskCategory[]).map((cat) => {
                const config = CATEGORY_CONFIG[cat];
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setTaskCategory(cat)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                      taskCategory === cat
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {config.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* プロジェクト（必須） */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              プロジェクト <span className="text-red-500">*</span>
            </label>
            {isLoadingProjects ? (
              <div className="text-sm text-slate-400 py-2">読み込み中...</div>
            ) : projects.length === 0 ? (
              <div className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                プロジェクトがありません。先にビジネスログからプロジェクトを作成してください。
              </div>
            ) : (
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="">プロジェクトを選択</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.organizationName ? `${p.organizationName} / ${p.name}` : p.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* タイトル */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              タイトル <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="タスクのタイトルを入力"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>

          {/* 説明 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              説明
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="タスクの詳細を入力（任意）"
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* 見積時間 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              見積時間
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
                placeholder="0"
                step="0.5"
                min="0"
                className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-500">時間</span>
            </div>
          </div>

          {/* 定型タスク: 繰り返し設定 */}
          {taskCategory === 'routine' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                繰り返し
              </label>
              <div className="flex gap-2">
                <select
                  value={recurrenceType}
                  onChange={(e) => setRecurrenceType(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">なし（単発）</option>
                  <option value="weekly">毎週</option>
                  <option value="biweekly">隔週</option>
                  <option value="monthly">毎月</option>
                </select>
                {(recurrenceType === 'weekly' || recurrenceType === 'biweekly') && (
                  <select
                    value={recurrenceDay}
                    onChange={(e) => setRecurrenceDay(e.target.value)}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">曜日を選択</option>
                    {DAY_LABELS.map((d, i) => (
                      <option key={i} value={i}>{d}曜日</option>
                    ))}
                  </select>
                )}
                {recurrenceType === 'monthly' && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={recurrenceDay}
                      onChange={(e) => setRecurrenceDay(e.target.value)}
                      placeholder="日"
                      min="1"
                      max="31"
                      className="w-16 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-500">日</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* チームタスク: 担当者 + 親タスク */}
          {taskCategory === 'team' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  担当者
                </label>
                <select
                  value={assigneeContactId}
                  onChange={(e) => setAssigneeContactId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">担当者を選択（任意）</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.companyName ? ` (${c.companyName})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  親タスク
                </label>
                <select
                  value={parentTaskId}
                  onChange={(e) => setParentTaskId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">なし（独立タスク）</option>
                  {parentTasks.map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* 優先度 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              優先度
            </label>
            <div className="flex gap-2">
              {(Object.keys(TASK_PRIORITY_CONFIG) as TaskPriority[]).map((p) => {
                const config = TASK_PRIORITY_CONFIG[p];
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-colors ${
                      priority === p
                        ? config.color
                        : 'bg-slate-50 text-slate-400 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {config.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* タグ */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              タグ
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="カンマ区切りで入力（例：営業, A社）"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* ボタン */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={onClose}
              type="button"
              className="flex-1"
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || !projectId || isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? '作成中...' : '作成'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
