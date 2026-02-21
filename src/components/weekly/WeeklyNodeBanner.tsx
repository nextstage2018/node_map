'use client';

import { useState, useEffect, useCallback } from 'react';
import type { NodeData } from '@/lib/types';
import { cn } from '@/lib/utils';

// 今週の月曜日を ISO 日付文字列で取得
function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay(); // 0=日, 1=月, ...
  const diff = day === 0 ? 6 : day - 1; // 月曜までの差分
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0]; // YYYY-MM-DD
}

// ノードタイプに応じたアイコン
function nodeTypeIcon(type: NodeData['type']): string {
  switch (type) {
    case 'keyword': return '🏷️';
    case 'person': return '👤';
    case 'project': return '📁';
    default: return '🏷️';
  }
}

// ノードタイプに応じたタグ色
function nodeTypeColor(type: NodeData['type'], isSelected: boolean): string {
  if (isSelected) {
    switch (type) {
      case 'keyword': return 'bg-blue-100 border-blue-400 text-blue-800';
      case 'person': return 'bg-green-100 border-green-400 text-green-800';
      case 'project': return 'bg-purple-100 border-purple-400 text-purple-800';
      default: return 'bg-blue-100 border-blue-400 text-blue-800';
    }
  }
  switch (type) {
    case 'keyword': return 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-blue-50';
    case 'person': return 'bg-white border-slate-200 text-slate-600 hover:border-green-300 hover:bg-green-50';
    case 'project': return 'bg-white border-slate-200 text-slate-600 hover:border-purple-300 hover:bg-purple-50';
    default: return 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-blue-50';
  }
}

interface WeeklyNodeBannerProps {
  userId: string;
}

export default function WeeklyNodeBanner({ userId }: WeeklyNodeBannerProps) {
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const weekStart = getWeekStart();

  // 週次ノードを取得
  useEffect(() => {
    const fetchWeeklyNodes = async () => {
      try {
        const res = await fetch(
          `/api/nodes/weekly?userId=${encodeURIComponent(userId)}&weekStart=${weekStart}`
        );
        const data = await res.json();
        if (data.success) {
          setNodes(data.data.nodes || []);
          setIsConfirmed(data.data.alreadyConfirmed || false);
        }
      } catch {
        // エラー時は非表示にする
        setNodes([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchWeeklyNodes();
  }, [userId, weekStart]);

  // ノード選択のトグル
  const toggleNode = useCallback((nodeId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // 全選択
  const selectAll = useCallback(() => {
    setSelectedIds(new Set(nodes.map((n) => n.id)));
  }, [nodes]);

  // 送信
  const handleSubmit = async () => {
    if (selectedIds.size === 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/nodes/weekly/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          nodeIds: Array.from(selectedIds),
          weekStart,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowSuccess(true);
        // 2秒後にバナーを非表示
        setTimeout(() => {
          setIsDismissed(true);
        }, 2000);
      }
    } catch {
      // エラー処理
    } finally {
      setIsSubmitting(false);
    }
  };

  // 非表示条件：ローディング中、確認済み、手動で閉じた、ノードなし
  if (isLoading || isConfirmed || isDismissed || nodes.length === 0) {
    return null;
  }

  // 送信完了後のサンクスメッセージ
  if (showSuccess) {
    return (
      <div className="mx-4 mt-3 p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 animate-fade-in">
        <div className="flex items-center gap-2 text-emerald-700">
          <span className="text-lg">✅</span>
          <span className="text-sm font-medium">
            {selectedIds.size}件のノードを確認しました！引き続き探求を楽しんでください。
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4 mt-3 rounded-xl bg-gradient-to-r from-indigo-50 via-blue-50 to-cyan-50 border border-blue-200 overflow-hidden">
      {/* ヘッダー */}
      <div className="px-4 pt-4 pb-2 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🧠</span>
            <h3 className="text-sm font-bold text-slate-800">
              今週のノード振り返り
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium">
              {nodes.length}件
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            今週あなたが触れたノードです。理解が深まった・自分で調べたものはどれですか？
          </p>
        </div>
        <button
          onClick={() => setIsDismissed(true)}
          className="text-slate-400 hover:text-slate-600 transition-colors p-1 -mt-1 -mr-1"
          title="閉じる（来週また表示されます）"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ノードタグ一覧 */}
      <div className="px-4 pb-2">
        <div className="flex flex-wrap gap-2">
          {nodes.map((node) => {
            const isSelected = selectedIds.has(node.id);
            return (
              <button
                key={node.id}
                onClick={() => toggleNode(node.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all cursor-pointer',
                  nodeTypeColor(node.type, isSelected),
                  isSelected && 'ring-1 ring-offset-1',
                  isSelected && node.type === 'keyword' && 'ring-blue-300',
                  isSelected && node.type === 'person' && 'ring-green-300',
                  isSelected && node.type === 'project' && 'ring-purple-300',
                )}
              >
                <span className="text-xs">{nodeTypeIcon(node.type)}</span>
                <span>{node.label}</span>
                {isSelected && (
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
                <span className="text-[10px] opacity-60">×{node.frequency}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* アクションバー */}
      <div className="px-4 py-3 bg-white/50 border-t border-blue-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={selectAll}
            className="text-[11px] text-blue-600 hover:text-blue-800 hover:underline transition-colors"
          >
            すべて選択
          </button>
          {selectedIds.size > 0 && (
            <span className="text-[11px] text-slate-400">
              {selectedIds.size}件選択中
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsDismissed(true)}
            className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors px-3 py-1.5"
          >
            あとで
          </button>
          <button
            onClick={handleSubmit}
            disabled={selectedIds.size === 0 || isSubmitting}
            className={cn(
              'text-xs font-medium px-4 py-1.5 rounded-lg transition-all',
              selectedIds.size > 0
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            )}
          >
            {isSubmitting ? '送信中...' : '確認する'}
          </button>
        </div>
      </div>
    </div>
  );
}
