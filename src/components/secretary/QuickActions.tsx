// Phase UI-3 + v3.1: クイックアクション（会話中のサジェストチップ）コンテキスト対応
'use client';

import {
  CheckSquare, Calendar, Zap, ClipboardList, Sparkles,
  Inbox, Sun, FolderInput, Building2, Home, TrendingUp,
  MessageSquare, Flag, Plus,
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

// 会話中に表示する4つの厳選アクション（デフォルト）
export const QUICK_ACTIONS: QuickAction[] = [
  { label: '今日やること', icon: <Sun className="w-3.5 h-3.5" />, message: '今日の状況を教えて', category: 'general' },
  { label: '新着メッセージ', icon: <Inbox className="w-3.5 h-3.5" />, message: '新着メッセージを見せて', category: 'inbox' },
  { label: 'タスクを作成', icon: <CheckSquare className="w-3.5 h-3.5" />, message: '新しいタスクを作成したい', category: 'task' },
  { label: '対応が必要', icon: <Zap className="w-3.5 h-3.5" />, message: '対応が必要なことは？', category: 'job' },
];

// v3.1: プロジェクトコンテキスト時のアクション
const PROJECT_ACTIONS: QuickAction[] = [
  { label: 'タスク追加', icon: <Plus className="w-3.5 h-3.5" />, message: '新しいタスクを作成したい', category: 'task' },
  { label: 'MS確認', icon: <Flag className="w-3.5 h-3.5" />, message: 'マイルストーンの進捗を教えて', category: 'general' },
  { label: '進捗確認', icon: <TrendingUp className="w-3.5 h-3.5" />, message: 'プロジェクトの進捗状況を教えて', category: 'general' },
  { label: '会議録登録', icon: <MessageSquare className="w-3.5 h-3.5" />, message: '会議録を登録したい', category: 'general' },
  { label: 'ホームに戻る', icon: <Home className="w-3.5 h-3.5" />, message: '今日の状況を教えて', category: 'general' },
];

// v3.1: タスクコンテキスト時のアクション
const TASK_ACTIONS: QuickAction[] = [
  { label: 'タスク進める', icon: <CheckSquare className="w-3.5 h-3.5" />, message: 'このタスクを進めたい', category: 'task' },
  { label: 'AI相談', icon: <Sparkles className="w-3.5 h-3.5" />, message: 'このタスクについてAIに相談', category: 'task' },
  { label: '進捗確認', icon: <TrendingUp className="w-3.5 h-3.5" />, message: 'プロジェクトの進捗状況を教えて', category: 'general' },
  { label: 'ホームに戻る', icon: <Home className="w-3.5 h-3.5" />, message: '今日の状況を教えて', category: 'general' },
];

// 初期画面用の全アクション
export const ALL_ACTIONS: QuickAction[] = [
  ...QUICK_ACTIONS,
  { label: '今日の予定', icon: <Calendar className="w-3.5 h-3.5" />, message: '今日の予定を教えて', category: 'general' },
  { label: '空き時間を探す', icon: <Calendar className="w-3.5 h-3.5" />, message: '今週の空き時間を教えて', category: 'general' },
  { label: 'タスクを進める', icon: <CheckSquare className="w-3.5 h-3.5" />, message: 'タスクを進めたい', category: 'task' },
  { label: '届いたファイル確認', icon: <FolderInput className="w-3.5 h-3.5" />, message: '届いたファイルを確認したい', category: 'general' },
  { label: 'プロジェクト進捗', icon: <ClipboardList className="w-3.5 h-3.5" />, message: 'プロジェクトの進捗状況を教えて', category: 'general' },
  { label: 'ナレッジ提案', icon: <Sparkles className="w-3.5 h-3.5" />, message: 'ナレッジの構造化提案を見せて', category: 'general' },
  { label: '組織を整理', icon: <Building2 className="w-3.5 h-3.5" />, message: '未登録の組織を確認して', category: 'general' },
];

// v3.1: コンテキストに応じたアクション選択
function getContextActions(contextProjectId?: string, contextTaskId?: string): QuickAction[] {
  if (contextTaskId) return TASK_ACTIONS;
  if (contextProjectId) return PROJECT_ACTIONS;
  return QUICK_ACTIONS;
}

// ========================================
// 会話中チップバー（v3.1: コンテキスト対応）
// ========================================
export function QuickActionBar({
  onSendMessage,
  contextProjectId,
  contextTaskId,
}: {
  onSendMessage: (message: string) => void;
  contextProjectId?: string;
  contextTaskId?: string;
}) {
  const actions = getContextActions(contextProjectId, contextTaskId);

  return (
    <div className="px-4 pb-2 shrink-0">
      <div className="max-w-3xl mx-auto flex flex-wrap gap-1.5">
        {actions.map((action) => (
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
