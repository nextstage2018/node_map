// Phase Restructure: ジョブページ — AIに委ねる日常の簡易作業リスト
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Job } from '@/lib/types';
import AppLayout from '@/components/shared/AppLayout';
import ContextBar from '@/components/shared/ContextBar';
import Button from '@/components/ui/Button';
import { Plus, Check, Trash2, Calendar } from 'lucide-react';

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs');
      const json = await res.json();
      if (json.success) {
        setJobs(json.data || []);
      }
    } catch (e) {
      console.error('ジョブ取得エラー:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), description: newDescription.trim() || undefined }),
      });
      const json = await res.json();
      if (json.success) {
        setJobs(prev => [json.data, ...prev]);
        setNewTitle('');
        setNewDescription('');
        setShowForm(false);
      }
    } catch (e) {
      console.error('ジョブ作成エラー:', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (job: Job) => {
    const newStatus = job.status === 'pending' ? 'done' : 'pending';
    try {
      const res = await fetch('/api/jobs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: job.id, status: newStatus }),
      });
      const json = await res.json();
      if (json.success) {
        setJobs(prev => prev.map(j => j.id === job.id ? json.data : j));
      }
    } catch (e) {
      console.error('ジョブ更新エラー:', e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/jobs?id=${id}`, { method: 'DELETE' });
      setJobs(prev => prev.filter(j => j.id !== id));
    } catch (e) {
      console.error('ジョブ削除エラー:', e);
    }
  };

  const filteredJobs = jobs.filter(j => {
    if (filter === 'all') return true;
    return j.status === filter;
  });

  const pendingCount = jobs.filter(j => j.status === 'pending').length;
  const doneCount = jobs.filter(j => j.status === 'done').length;

  return (
    <AppLayout>
      <ContextBar
        title="ジョブ"
        subtitle="AIに委ねる日常の簡易作業"
      />

      <div className="p-4 max-w-3xl mx-auto">
        {/* 統計 */}
        <div className="flex gap-4 mb-4 text-sm text-gray-500">
          <span>未完了: {pendingCount}</span>
          <span>完了: {doneCount}</span>
        </div>

        {/* フィルター + 新規ボタン */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex gap-1">
            {(['all', 'pending', 'done'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-sm rounded-full ${
                  filter === f
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f === 'all' ? 'すべて' : f === 'pending' ? '未完了' : '完了'}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <Button
            onClick={() => setShowForm(!showForm)}
            variant="primary"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-1" />
            新規ジョブ
          </Button>
        </div>

        {/* 新規作成フォーム */}
        {showForm && (
          <div className="bg-white border rounded-lg p-4 mb-4 shadow-sm">
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="ジョブのタイトル（例: ◯◯さんに日程返信）"
              className="w-full px-3 py-2 border rounded-lg mb-2 text-sm"
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            <textarea
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              placeholder="詳細（任意）"
              className="w-full px-3 py-2 border rounded-lg mb-2 text-sm resize-none"
              rows={2}
            />
            <div className="flex gap-2 justify-end">
              <Button onClick={() => setShowForm(false)} variant="secondary" size="sm">キャンセル</Button>
              <Button onClick={handleCreate} variant="primary" size="sm" disabled={isSubmitting || !newTitle.trim()}>
                {isSubmitting ? '作成中...' : '作成'}
              </Button>
            </div>
          </div>
        )}

        {/* ジョブ一覧 */}
        {isLoading ? (
          <div className="text-center text-gray-400 py-8">読み込み中...</div>
        ) : filteredJobs.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            {filter === 'all' ? 'ジョブがありません' : `${filter === 'pending' ? '未完了' : '完了'}のジョブがありません`}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredJobs.map(job => (
              <div
                key={job.id}
                className={`flex items-center gap-3 p-3 bg-white border rounded-lg hover:shadow-sm transition-shadow ${
                  job.status === 'done' ? 'opacity-60' : ''
                }`}
              >
                {/* チェックボックス */}
                <button
                  onClick={() => handleToggleStatus(job)}
                  className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                    job.status === 'done'
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {job.status === 'done' && <Check className="w-3 h-3" />}
                </button>

                {/* タイトル・説明 */}
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${job.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                    {job.title}
                  </div>
                  {job.description && (
                    <div className="text-xs text-gray-400 truncate">{job.description}</div>
                  )}
                </div>

                {/* 期限 */}
                {job.dueDate && (
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Calendar className="w-3 h-3" />
                    {job.dueDate}
                  </div>
                )}

                {/* 削除 */}
                <button
                  onClick={() => handleDelete(job.id)}
                  className="text-gray-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
