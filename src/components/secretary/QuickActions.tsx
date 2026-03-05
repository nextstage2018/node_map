// Phase UI-3: クイックアクション（会話中のサジェストチップ）
'use client';

import {
  CheckSquare, Calendar, Zap, ClipboardList, Sparkles,
  Inbox, Sun, FolderInput, Building2,
} from 'lucide-react';

// ========================================
// クイックアクション定義
// ========================================
export interface QuickAction {
  label: string;
  icon: React.ReactNode;
  message: string;
  category: 'inbox' | 'task' | 'job' | 'general';
}

// 会話中に表示する4つの厳選アクション
export const QUICK_ACTIONS: QuickAction[] = [
  { label: '今日やること', icon: <Sun className="w-3.5 h-3.5" />, message: '今日の状況を教えて', category: 'general' },
  { label: '新着メッセージ', icon: <Inbox className="w-3.5 h-3.5" />, message: '新着メッセージを見せて', category: 'inbox' },
  { label: 'タスクを作成', icon: <CheckSquare className="w-3.5 h-3.5" />, message: '新しいタスクを作成したい', category: 'task' },
  { label: '対応が必要', icon: <Zap className="w-3.5 h-3.5" />, message: '対応が必要なことは？', category: 'job' },
];

// 初期画面用の全アクション
export const ALL_ACTIONS: QuickAction[] = [
  ...QUICK_ACTIONS,
  { label: '今日の予定', icon: <Calendar className="w-3.5 h-3.5" />, message: '今日の予定を教えて', category: 'general' },
  { label: '空き時間を探す', icon: <Calendar className="w-3.5 h-3.5" />, message: '今週の空き時間を教えて', category: 'general' },
  { label: 'タスクを進める', icon: <CheckSquare className="w-3.5 h-3.5" />, message: 'タスクを進めたい', category: 'task' },
  { label: '届いたファイル確認', icon: <FolderInput className="w-3.5 h-3.5" />, message: '届いたファイルを確認したい', category: 'general' },
  { label: 'プロジェクトを確認', icon: <ClipboardList className="w-3.5 h-3.5" />, message: 'プロジェクト一覧を見せて', category: 'general' },
  { label: 'ナレッジ提案', icon: <Sparkles className="w-3.5 h-3.5" />, message: 'ナレッジの構造化提案を見せて', category: 'general' },
  { label: '組織を整理', icon: <Building2 className="w-3.5 h-3.5" />, message: '未登録の組織を確認して', category: 'general' },
];

// ========================================
// 会話中チップバー
// ========================================
export function QuickActionBar({
  onSendMessage,
}: {
  onSendMessage: (message: string) => void;
}) {
  return (
    <div className="px-4 pb-2 shrink-0">
      <div className="max-w-3xl mx-auto flex flex-wrap gap-1.5">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.label}
            onClick={() => onSendMessage(action.message)}
            className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-slate-500 bg-white border border-slate-200 rounded-full hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all shadow-nm-sm"
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
