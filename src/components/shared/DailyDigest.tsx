'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { DailyDigestResponse } from '@/lib/types';
import { cn } from '@/lib/utils';

// 優先度の色設定
const PRIORITY_CONFIG = {
  high: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    dot: 'bg-red-500',
    label: '高',
  },
  medium: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
    label: '中',
  },
  low: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    dot: 'bg-green-500',
    label: '低',
  },
} as const;

// 推奨アクションに対応するナビゲーションリンク
function getActionLink(action: string): string {
  const lower = action.toLowerCase();
  if (lower.includes('メッセージ') || lower.includes('未読') || lower.includes('返信')) {
    return '/inbox';
  }
  if (lower.includes('タスク')) {
    return '/tasks';
  }
  if (lower.includes('ナレッジ') || lower.includes('マップ') || lower.includes('ノード')) {
    return '/map';
  }
  if (lower.includes('コンタクト') || lower.includes('連絡先')) {
    return '/contacts';
  }
  return '/inbox';
}

export default function DailyDigest() {
  const [digest, setDigest] = useState<DailyDigestResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDigest = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/daily-digest');
      const json = await res.json();
      if (json.success && json.data) {
        setDigest(json.data);
      } else {
        setError(json.error || 'ダイジェストの取得に失敗しました');
      }
    } catch (err) {
      console.error('DailyDigest fetch error:', err);
      setError('ダイジェストの取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDigest();
  }, [fetchDigest]);

  // ローディング中のスケルトン
  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-slate-200 rounded-lg" />
          <div className="h-5 w-32 bg-slate-200 rounded" />
          <div className="ml-auto h-4 w-16 bg-slate-200 rounded" />
        </div>
        {/* 統計スケルトン */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-50 rounded-lg p-3">
              <div className="h-3 w-12 bg-slate-200 rounded mb-2" />
              <div className="h-6 w-8 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
        {/* サマリースケルトン */}
        <div className="space-y-2 mb-4">
          <div className="h-3 w-full bg-slate-200 rounded" />
          <div className="h-3 w-3/4 bg-slate-200 rounded" />
        </div>
        {/* 推奨アクションスケルトン */}
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-slate-100 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // エラー表示
  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-xl p-5">
        <div className="flex items-center gap-2 text-red-600">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 6v5M10 13.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="text-sm font-medium">{error}</span>
        </div>
        <button
          onClick={fetchDigest}
          className="mt-3 text-xs text-blue-600 hover:underline"
        >
          再読み込み
        </button>
      </div>
    );
  }

  if (!digest) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden transition-all">
      {/* ヘッダー */}
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setIsCollapsed(!isCollapsed)}
      >
        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M10 2L12.5 7.5L18 8.5L14 12.5L15 18L10 15.5L5 18L6 12.5L2 8.5L7.5 7.5L10 2Z" fill="#2563EB" />
          </svg>
        </div>
        <h2 className="text-sm font-bold text-slate-900">
          今日のダイジェスト
        </h2>
        <span className="ml-auto text-slate-400 transition-transform" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>

      {/* コンテンツ（折りたたみ対応） */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-300',
          isCollapsed ? 'max-h-0' : 'max-h-[600px]'
        )}
      >
        <div className="px-5 pb-5">
          {/* 統計カード */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="3" width="14" height="10" rx="2" stroke="#2563EB" strokeWidth="1.2" />
                  <path d="M1 5L8 9L15 5" stroke="#2563EB" strokeWidth="1.2" />
                </svg>
                <span className="text-[10px] text-blue-600 font-medium">未読</span>
              </div>
              <span className="text-xl font-bold text-blue-700">{digest.stats.unreadMessages}</span>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="2" width="12" height="12" rx="2" stroke="#D97706" strokeWidth="1.2" />
                  <path d="M5 8L7 10L11 6" stroke="#D97706" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[10px] text-amber-600 font-medium">タスク</span>
              </div>
              <span className="text-xl font-bold text-amber-700">{digest.stats.pendingTasks}</span>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="#16A34A" strokeWidth="1.2" />
                  <circle cx="8" cy="8" r="2" fill="#16A34A" />
                </svg>
                <span className="text-[10px] text-green-600 font-medium">ノード</span>
              </div>
              <span className="text-xl font-bold text-green-700">{digest.stats.newNodes}</span>
            </div>
          </div>

          {/* AI要約 */}
          <div className="bg-slate-50 rounded-lg p-3 mb-4">
            <p className="text-sm text-slate-700 leading-relaxed">{digest.summary}</p>
          </div>

          {/* 推奨アクション */}
          <div className="space-y-2">
            <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              推奨アクション
            </h3>
            {digest.recommendations.map((rec, idx) => {
              const config = PRIORITY_CONFIG[rec.priority];
              const link = getActionLink(rec.action);
              return (
                <Link
                  key={idx}
                  href={link}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg border transition-colors hover:shadow-sm',
                    config.bg,
                    config.border
                  )}
                >
                  <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', config.dot)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={cn('text-sm font-medium', config.text)}>
                        {rec.action}
                      </span>
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0',
                        config.text,
                        config.bg,
                        'border',
                        config.border
                      )}>
                        {config.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{rec.reason}</p>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-slate-300 shrink-0 mt-1">
                    <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
