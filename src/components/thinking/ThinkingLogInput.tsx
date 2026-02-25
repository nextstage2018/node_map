'use client';

import { useState } from 'react';
import type { ThinkingLogType, CreateThinkingLogRequest } from '@/lib/types';

// ログタイプの設定
const LOG_TYPE_CONFIG: { key: ThinkingLogType; label: string; icon: string; color: string; bgColor: string }[] = [
  { key: 'hypothesis', label: '仮説', icon: '\uD83D\uDCA1', color: 'text-purple-700', bgColor: 'bg-purple-50 border-purple-200' },
  { key: 'observation', label: '観察', icon: '\uD83D\uDC41', color: 'text-blue-700', bgColor: 'bg-blue-50 border-blue-200' },
  { key: 'insight', label: '気づき', icon: '\u2728', color: 'text-green-700', bgColor: 'bg-green-50 border-green-200' },
  { key: 'question', label: '疑問', icon: '\u2753', color: 'text-yellow-700', bgColor: 'bg-yellow-50 border-yellow-200' },
];

interface ThinkingLogInputProps {
  defaultLinkedNodeId?: string;
  onSubmit: (req: CreateThinkingLogRequest) => Promise<void>;
  isSubmitting?: boolean;
}

export default function ThinkingLogInput({
  defaultLinkedNodeId,
  onSubmit,
  isSubmitting = false,
}: ThinkingLogInputProps) {
  const [content, setContent] = useState('');
  const [logType, setLogType] = useState<ThinkingLogType>('observation');
  const [tagInput, setTagInput] = useState('');

  const handleSubmit = async () => {
    if (!content.trim() || isSubmitting) return;

    const tags = tagInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    await onSubmit({
      content: content.trim(),
      logType,
      linkedNodeId: defaultLinkedNodeId,
      tags,
    });

    setContent('');
    setTagInput('');
  };

  return (
    <div className="space-y-3">
      {/* ログタイプ選択 */}
      <div className="flex gap-1">
        {LOG_TYPE_CONFIG.map((lt) => (
          <button
            key={lt.key}
            onClick={() => setLogType(lt.key)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              logType === lt.key
                ? `${lt.bgColor} ${lt.color}`
                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            <span>{lt.icon}</span>
            <span>{lt.label}</span>
          </button>
        ))}
      </div>

      {/* テキストエリア */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="思考を記録..."
        rows={3}
        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
          placeholder:text-slate-400 resize-none"
      />

      {/* タグ入力 + 送信ボタン */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          placeholder="タグ（カンマ区切り）"
          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            placeholder:text-slate-400"
        />
        <button
          onClick={handleSubmit}
          disabled={!content.trim() || isSubmitting}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg
            hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors whitespace-nowrap"
        >
          {isSubmitting ? '保存中...' : '記録'}
        </button>
      </div>
    </div>
  );
}
