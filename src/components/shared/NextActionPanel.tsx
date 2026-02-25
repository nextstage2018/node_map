'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { NextActionSuggestion } from '@/lib/types';
import { cn } from '@/lib/utils';

// アクションタイプごとのアイコンと色設定
const ACTION_TYPE_CONFIG = {
  reply: {
    label: '返信',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M6 3L2 7L6 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 7H10C12.2 7 14 8.8 14 11V13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  create_task: {
    label: 'タスク作成',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
        <path d="M8 5V11M5 8H11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  add_node: {
    label: 'ノード追加',
    color: 'text-green-600',
    bg: 'bg-green-50',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
        <path d="M8 5V11M5 8H11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  follow_up: {
    label: 'フォローアップ',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
        <path d="M8 4V8L11 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
} as const;

// パスからコンテキストを判定
function getContextFromPath(pathname: string): 'inbox' | 'task' | 'nodemap' {
  if (pathname.startsWith('/tasks')) return 'task';
  if (pathname.startsWith('/map')) return 'nodemap';
  return 'inbox';
}

// アクションタイプからリンク先を判定
function getActionRoute(type: string): string {
  switch (type) {
    case 'reply':
      return '/inbox';
    case 'create_task':
      return '/tasks';
    case 'add_node':
      return '/map';
    case 'follow_up':
      return '/inbox';
    default:
      return '/inbox';
  }
}

export default function NextActionPanel() {
  const pathname = usePathname();
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<NextActionSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    if (!pathname) return;
    setIsLoading(true);
    setError(null);
    try {
      const context = getContextFromPath(pathname);
      const res = await fetch('/api/ai/next-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
      });
      const json = await res.json();
      if (json.success && json.data?.suggestions) {
        setSuggestions(json.data.suggestions);
      } else {
        setError(json.error || '提案の取得に失敗しました');
      }
    } catch (err) {
      console.error('NextActionPanel fetch error:', err);
      setError('提案の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [pathname]);

  // パス変更時にサジェストを再取得
  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  // アクション実行
  const handleAction = useCallback((suggestion: NextActionSuggestion) => {
    const route = getActionRoute(suggestion.type);
    router.push(route);
  }, [router]);

  // 非表示時は何も描画しない
  if (isHidden) {
    return (
      <button
        onClick={() => setIsHidden(false)}
        className="fixed bottom-4 left-4 z-50 w-10 h-10 bg-blue-600 rounded-full shadow-lg flex items-center justify-center text-white hover:bg-blue-700 transition-colors"
        title="AIサジェストを表示"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <path d="M10 2L12.5 7.5L18 8.5L14 12.5L15 18L10 15.5L5 18L6 12.5L2 8.5L7.5 7.5L10 2Z" fill="currentColor" />
        </svg>
      </button>
    );
  }

  // 最小化時
  if (isMinimized) {
    return (
      <div className="fixed bottom-4 left-4 z-50">
        <button
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 bg-white border border-slate-200 rounded-full shadow-lg px-4 py-2 hover:shadow-xl transition-shadow"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path d="M10 2L12.5 7.5L18 8.5L14 12.5L15 18L10 15.5L5 18L6 12.5L2 8.5L7.5 7.5L10 2Z" fill="#2563EB" />
          </svg>
          <span className="text-xs font-medium text-slate-700">
            次にやること
          </span>
          {suggestions.length > 0 && (
            <span className="text-[10px] bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 font-bold">
              {suggestions.length}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 w-80">
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
        {/* ヘッダー */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path d="M10 2L12.5 7.5L18 8.5L14 12.5L15 18L10 15.5L5 18L6 12.5L2 8.5L7.5 7.5L10 2Z" fill="#2563EB" />
          </svg>
          <span className="text-sm font-bold text-slate-800">次にやること</span>
          <div className="ml-auto flex items-center gap-1">
            {/* 更新ボタン */}
            <button
              onClick={fetchSuggestions}
              className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
              title="更新"
              disabled={isLoading}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={isLoading ? 'animate-spin' : ''}>
                <path d="M14 8A6 6 0 112 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M14 3V8H9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {/* 最小化ボタン */}
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
              title="最小化"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            {/* 閉じるボタン */}
            <button
              onClick={() => setIsHidden(true)}
              className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
              title="閉じる"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* コンテンツ */}
        <div className="max-h-80 overflow-y-auto">
          {isLoading ? (
            // ローディングスケルトン
            <div className="p-3 space-y-2 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50">
                  <div className="w-8 h-8 bg-slate-200 rounded-lg shrink-0" />
                  <div className="flex-1">
                    <div className="h-3 w-24 bg-slate-200 rounded mb-2" />
                    <div className="h-2 w-full bg-slate-200 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            // エラー表示
            <div className="p-4 text-center">
              <p className="text-sm text-red-500 mb-2">{error}</p>
              <button
                onClick={fetchSuggestions}
                className="text-xs text-blue-600 hover:underline"
              >
                再読み込み
              </button>
            </div>
          ) : suggestions.length === 0 ? (
            // 空状態
            <div className="p-6 text-center">
              <p className="text-sm text-slate-400">現在の提案はありません</p>
            </div>
          ) : (
            // サジェストリスト
            <div className="p-2 space-y-1">
              {suggestions.map((suggestion) => {
                const typeConfig = ACTION_TYPE_CONFIG[suggestion.type] || ACTION_TYPE_CONFIG.follow_up;
                return (
                  <button
                    key={suggestion.id}
                    onClick={() => handleAction(suggestion)}
                    className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors text-left group"
                  >
                    {/* アイコン */}
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', typeConfig.bg, typeConfig.color)}>
                      {typeConfig.icon}
                    </div>
                    {/* テキスト */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-slate-800 group-hover:text-blue-600 transition-colors">
                          {suggestion.action}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
                        {suggestion.description}
                      </p>
                      <span className={cn('inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded font-medium', typeConfig.bg, typeConfig.color)}>
                        {typeConfig.label}
                      </span>
                    </div>
                    {/* 矢印 */}
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-slate-300 group-hover:text-blue-400 shrink-0 mt-1 transition-colors">
                      <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* アニメーション用のスタイル */}
      <style jsx>{`
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        div:first-child {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
