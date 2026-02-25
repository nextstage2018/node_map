'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Seed, SeedStatus } from '@/lib/types';
import Header from '@/components/shared/Header';
import SeedCard from '@/components/seeds/SeedCard';
import SeedTagInput from '@/components/seeds/SeedTagInput';

type StatusFilter = SeedStatus | 'all';

export default function SeedsPage() {
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTags, setNewTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 種の取得
  const fetchSeeds = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('status', statusFilter);
      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }

      const res = await fetch(`/api/seeds?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setSeeds(data.data);
      }
    } catch {
      // サイレント
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    fetchSeeds();
  }, [fetchSeeds]);

  // 種の作成
  const handleCreate = async () => {
    if (!newContent.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/seeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newContent.trim(),
          tags: newTags.length > 0 ? newTags : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSeeds((prev) => [data.data, ...prev]);
        setNewContent('');
        setNewTags([]);
      }
    } catch {
      // サイレント
    } finally {
      setIsSubmitting(false);
    }
  };

  // 種の更新
  const handleUpdate = async (seedId: string, content: string, tags: string[]) => {
    try {
      const res = await fetch('/api/seeds', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedId, content, tags }),
      });
      const data = await res.json();
      if (data.success) {
        setSeeds((prev) => prev.map((s) => (s.id === seedId ? data.data : s)));
      }
    } catch {
      // サイレント
    }
  };

  // 種の削除
  const handleDelete = async (seedId: string) => {
    try {
      const res = await fetch(`/api/seeds?seedId=${seedId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setSeeds((prev) => prev.filter((s) => s.id !== seedId));
      }
    } catch {
      // サイレント
    }
  };

  // 種のタスク化
  const handleConfirm = async (seedId: string) => {
    try {
      const res = await fetch(`/api/seeds/${seedId}/confirm`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setSeeds((prev) => prev.filter((s) => s.id !== seedId));
      }
    } catch {
      // サイレント
    }
  };

  // 全タグのユニークリスト
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    seeds.forEach((s) => (s.tags || []).forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [seeds]);

  const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: '全て' },
    { key: 'pending', label: '保留中' },
    { key: 'confirmed', label: '確定済み' },
  ];

  return (
    <div className="flex flex-col h-screen bg-slate-100">
      <Header />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {/* ページヘッダー */}
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <span>{'\uD83C\uDF31'}</span>
              種ボックス
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              アイデアやメモを種として記録し、タスクに育てましょう。
            </p>
          </div>

          {/* 新規入力フォーム */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="新しい種を入力..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                placeholder:text-slate-400 resize-none"
            />
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-1">タグ</label>
                <SeedTagInput tags={newTags} onChange={setNewTags} />
              </div>
              <button
                onClick={handleCreate}
                disabled={!newContent.trim() || isSubmitting}
                className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg
                  hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors whitespace-nowrap"
              >
                {isSubmitting ? '追加中...' : '種を追加'}
              </button>
            </div>
          </div>

          {/* フィルタバー */}
          <div className="flex items-center gap-4">
            {/* ステータスフィルタ */}
            <div className="flex bg-white rounded-lg border border-slate-200 p-0.5">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setStatusFilter(opt.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    statusFilter === opt.key
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* テキスト検索 */}
            <div className="flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="種を検索..."
                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  placeholder:text-slate-400"
              />
            </div>

            {/* 件数表示 */}
            <span className="text-xs text-slate-400">
              {seeds.length}件
            </span>
          </div>

          {/* タグフィルタ（タグがある場合のみ表示） */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSearchQuery(tag)}
                  className="px-2 py-0.5 text-[10px] bg-slate-100 text-slate-600
                    rounded-full hover:bg-blue-50 hover:text-blue-600 transition-colors"
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          {/* 種一覧 */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
              <span className="ml-2 text-sm text-slate-500">読み込み中...</span>
            </div>
          ) : seeds.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {seeds.map((seed) => (
                <SeedCard
                  key={seed.id}
                  seed={seed}
                  onConfirm={() => handleConfirm(seed.id)}
                  onUpdate={(content, tags) => handleUpdate(seed.id, content, tags)}
                  onDelete={() => handleDelete(seed.id)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-slate-400 text-sm">
                {searchQuery || statusFilter !== 'all'
                  ? '条件に一致する種がありません。'
                  : '種はまだありません。上のフォームからアイデアを入力してみましょう。'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
