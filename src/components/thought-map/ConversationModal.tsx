'use client';

// Phase 42f残り: 思考マップのノードから会話にジャンプする際に表示するモーダル
// turnId で会話APIを叩き、該当ターンの前後の会話を表示する

import { useState, useEffect, useRef } from 'react';
import { X, MessageCircle, Loader2 } from 'lucide-react';

interface ConversationEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  turnId: string | null;
  phase: string | null;
  conversationTag: string | null;
  createdAt: string;
}

interface ConversationData {
  source: 'seed' | 'task';
  sourceId: string;
  targetTurnId?: string;
  targetTime: string;
  conversations: ConversationEntry[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sourceConversationId: string | null; // turnId
  nodeLabel: string;
  // フォールバック用
  seedId?: string;
  taskId?: string;
  createdAt?: string;
}

export default function ConversationModal({
  isOpen,
  onClose,
  sourceConversationId,
  nodeLabel,
  seedId,
  taskId,
  createdAt,
}: Props) {
  const [data, setData] = useState<ConversationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    setData(null);

    let url = '/api/conversations?';
    if (sourceConversationId) {
      url += `turnId=${sourceConversationId}`;
    } else if (seedId && createdAt) {
      url += `seedId=${seedId}&around=${encodeURIComponent(createdAt)}`;
    } else if (taskId && createdAt) {
      url += `taskId=${taskId}&around=${encodeURIComponent(createdAt)}`;
    } else {
      setError('会話の参照情報がありません');
      setLoading(false);
      return;
    }

    fetch(url)
      .then(res => res.json())
      .then(json => {
        if (json.success && json.data) {
          setData(json.data);
        } else {
          setError(json.error || '会話を取得できませんでした');
        }
      })
      .catch(() => setError('通信エラーが発生しました'))
      .finally(() => setLoading(false));
  }, [isOpen, sourceConversationId, seedId, taskId, createdAt]);

  // ターゲットの会話にスクロール
  useEffect(() => {
    if (data && targetRef.current) {
      setTimeout(() => {
        targetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [data]);

  if (!isOpen) return null;

  const isTargetTurn = (entry: ConversationEntry) => {
    if (sourceConversationId && entry.turnId) {
      return entry.turnId === sourceConversationId;
    }
    if (createdAt) {
      const diff = Math.abs(new Date(entry.createdAt).getTime() - new Date(createdAt).getTime());
      return diff < 5000; // 5秒以内
    }
    return false;
  };

  // キーワードハイライト
  const highlightKeyword = (text: string) => {
    if (!nodeLabel) return text;
    const escaped = nodeLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part)
        ? <mark key={i} className="bg-amber-400/30 text-amber-200 rounded px-0.5">{part}</mark>
        : part
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-600 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-bold text-slate-100">
              「{nodeLabel}」が登場した会話
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-700 text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ソース情報 */}
        {data && (
          <div className="px-5 py-2 text-xs text-slate-400 border-b border-slate-700/50">
            {data.source === 'seed' ? '種' : 'タスク'} の会話 · {data.conversations.length}件のメッセージ
          </div>
        )}

        {/* コンテンツ */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              会話を読み込み中...
            </div>
          )}

          {error && (
            <div className="text-center py-12 text-slate-400">
              <p className="text-sm">{error}</p>
              <p className="text-xs mt-2">
                このノードは会話リンクが記録される前に作成された可能性があります。
              </p>
            </div>
          )}

          {data && data.conversations.map((entry) => {
            const isTarget = isTargetTurn(entry);
            return (
              <div
                key={entry.id}
                ref={isTarget && entry.role === 'user' ? targetRef : undefined}
                className={`rounded-lg p-3 text-sm ${
                  isTarget
                    ? 'ring-2 ring-amber-400/50 bg-slate-700/80'
                    : 'bg-slate-700/40'
                } ${
                  entry.role === 'user' ? 'ml-4' : 'mr-4'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    entry.role === 'user'
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'bg-green-500/20 text-green-300'
                  }`}>
                    {entry.role === 'user' ? 'あなた' : 'AI'}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {new Date(entry.createdAt).toLocaleString('ja-JP')}
                  </span>
                  {isTarget && (
                    <span className="text-[10px] font-medium text-amber-400">
                      ← このターン
                    </span>
                  )}
                </div>
                <div className="text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {highlightKeyword(entry.content)}
                </div>
              </div>
            );
          })}
        </div>

        {/* フッター */}
        <div className="px-5 py-3 border-t border-slate-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-200 transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
