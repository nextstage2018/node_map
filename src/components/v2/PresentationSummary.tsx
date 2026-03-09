// V2-F: 会議用サマリー表示コンポーネント（コピーボタン付き）
'use client';

import { useState } from 'react';
import { ClipboardCopy, Check } from 'lucide-react';

interface PresentationSummaryProps {
  summary: string;
  milestoneTitle: string;
  achievementLevel: string;
}

export default function PresentationSummary({
  summary,
  milestoneTitle,
  achievementLevel,
}: PresentationSummaryProps) {
  const [copied, setCopied] = useState(false);

  const levelLabel =
    achievementLevel === 'achieved' ? '達成' :
    achievementLevel === 'partially' ? '一部達成' : '未達';

  const fullText = `【${milestoneTitle}】${levelLabel}\n${summary}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // フォールバック: 古いブラウザ対応
      const textarea = document.createElement('textarea');
      textarea.value = fullText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-600">
          会議用サマリー
        </span>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-green-500" />
              コピー済み
            </>
          ) : (
            <>
              <ClipboardCopy className="w-3 h-3" />
              コピー
            </>
          )}
        </button>
      </div>
      <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
        {summary}
      </p>
    </div>
  );
}
