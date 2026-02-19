'use client';

import { useState } from 'react';
import type { Seed } from '@/lib/types';
import SeedCard from './SeedCard';

interface SeedBoxProps {
  seeds: Seed[];
  onCreateSeed: (content: string) => Promise<unknown>;
  onConfirmSeed: (seedId: string) => Promise<unknown>;
  isExpanded: boolean;
  onToggle: () => void;
}

export default function SeedBox({
  seeds,
  onCreateSeed,
  onConfirmSeed,
  isExpanded,
  onToggle,
}: SeedBoxProps) {
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!input.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onCreateSeed(input.trim());
      setInput('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      {/* ヘッダー（折りたたみトグル） */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🌱</span>
          <span className="font-medium text-slate-700">種ボックス</span>
          {seeds.length > 0 && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              {seeds.length}
            </span>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 展開コンテンツ */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-slate-100">
          {/* 入力エリア */}
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="アイデアやメモを入力... (Enter で追加)"
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                placeholder:text-slate-400"
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isSubmitting}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg
                hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors whitespace-nowrap"
            >
              追加
            </button>
          </div>

          {/* 種リスト */}
          {seeds.length > 0 ? (
            <div className="mt-3 space-y-2">
              {seeds.map((seed) => (
                <SeedCard
                  key={seed.id}
                  seed={seed}
                  onConfirm={() => onConfirmSeed(seed.id)}
                />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-400 text-center py-2">
              種はまだありません。思いついたことを入力してみましょう。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
