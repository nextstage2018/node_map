'use client';

// Phase 28: ナレッジ追加フィードバックトースト
// 各アクション（種・タスク・ジョブ・送信）実行後に
// 「〇〇をナレッジに追加しました」と表示する

import { useState, useEffect, useCallback } from 'react';

interface KnowledgeToastData {
  id: string;
  keywords: string[];
  newKeywords: string[];
  trigger: string;
  timestamp: number;
}

// トリガー名の日本語ラベル
const TRIGGER_LABELS: Record<string, string> = {
  seed: '種から',
  task_create: 'タスク作成から',
  task_complete: 'タスク完了から',
  job_execute: 'ジョブ実行から',
  message_send: '送信メッセージから',
  message_receive: '受信メッセージから',
};

// グローバルイベントバス（コンポーネント間通信用）
const listeners: Set<(data: KnowledgeToastData) => void> = new Set();

/**
 * ナレッジ追加トーストを表示する
 * 任意のコンポーネントから呼び出し可能
 */
export function showKnowledgeToast(params: {
  keywords: string[];
  newKeywords: string[];
  trigger: string;
}): void {
  const data: KnowledgeToastData = {
    id: `toast-${Date.now()}`,
    keywords: params.keywords,
    newKeywords: params.newKeywords,
    trigger: params.trigger,
    timestamp: Date.now(),
  };
  listeners.forEach((listener) => listener(data));
}

/**
 * API レスポンスの knowledge フィールドからトーストを表示
 */
export function handleKnowledgeResponse(
  response: { knowledge?: { keywords?: string[]; newKeywords?: string[] } | null },
  trigger: string
): void {
  if (response.knowledge && response.knowledge.keywords && response.knowledge.keywords.length > 0) {
    showKnowledgeToast({
      keywords: response.knowledge.keywords,
      newKeywords: response.knowledge.newKeywords || [],
      trigger,
    });
  }
}

// ========================================
// トーストコンポーネント
// ========================================
export default function KnowledgeToast() {
  const [toasts, setToasts] = useState<KnowledgeToastData[]>([]);

  const addToast = useCallback((data: KnowledgeToastData) => {
    setToasts((prev) => [...prev, data]);
    // 5秒後に自動削除
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== data.id));
    }, 5000);
  }, []);

  useEffect(() => {
    listeners.add(addToast);
    return () => {
      listeners.delete(addToast);
    };
  }, [addToast]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="bg-white border border-emerald-200 rounded-lg shadow-lg p-4 animate-slide-up"
          onClick={() => dismiss(toast.id)}
          role="button"
          tabIndex={0}
        >
          {/* ヘッダー */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-emerald-600 text-lg">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 2L12.5 7.5L18 8.5L14 12.5L15 18L10 15.5L5 18L6 12.5L2 8.5L7.5 7.5L10 2Z" fill="currentColor"/>
              </svg>
            </span>
            <span className="text-sm font-medium text-emerald-800">
              ナレッジに追加しました
            </span>
            <span className="text-xs text-gray-400 ml-auto">
              {TRIGGER_LABELS[toast.trigger] || toast.trigger}
            </span>
          </div>

          {/* キーワード一覧 */}
          <div className="flex flex-wrap gap-1">
            {toast.keywords.map((kw, i) => {
              const isNew = toast.newKeywords.includes(kw);
              return (
                <span
                  key={i}
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    isNew
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {isNew && (
                    <span className="mr-1 text-emerald-500">NEW</span>
                  )}
                  {kw}
                </span>
              );
            })}
          </div>

          {/* 新規キーワードがある場合の補足 */}
          {toast.newKeywords.length > 0 && (
            <p className="text-xs text-emerald-600 mt-2">
              {toast.newKeywords.length}件の新規キーワードをマスタに登録しました
            </p>
          )}
        </div>
      ))}

      {/* スライドアップアニメーション */}
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
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
