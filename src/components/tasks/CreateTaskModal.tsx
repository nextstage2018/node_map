'use client';

import { useState, useEffect } from 'react';
import { TaskPriority, CreateTaskRequest } from '@/lib/types';
import { TASK_PRIORITY_CONFIG } from '@/lib/constants';
import Button from '@/components/ui/Button';

interface Project {
  id: string;
  name: string;
  organizationName?: string;
}

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
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">新しいタスク</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

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
