'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Task, TaskPhase, AiConversationMessage, ConversationTag } from '@/lib/types';
import {
  TASK_PHASE_CONFIG,
  PROGRESS_QUICK_ACTIONS,
} from '@/lib/constants';
import { cn, formatRelativeTime } from '@/lib/utils';

// Phase 17: 会話タグのスタイル設定
const CONVERSATION_TAG_STYLE: Record<ConversationTag, { bg: string; text: string; icon: string }> = {
  '情報収集':       { bg: 'bg-sky-100',    text: 'text-sky-700',    icon: '🔍' },
  '判断相談':       { bg: 'bg-violet-100',  text: 'text-violet-700', icon: '⚖️' },
  '壁の突破':       { bg: 'bg-orange-100',  text: 'text-orange-700', icon: '🔨' },
  'アウトプット生成': { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: '✏️' },
  '確認・検証':     { bg: 'bg-amber-100',   text: 'text-amber-700',  icon: '✅' },
  '整理・構造化':   { bg: 'bg-indigo-100',  text: 'text-indigo-700', icon: '📐' },
  'その他':         { bg: 'bg-slate-100',   text: 'text-slate-500',  icon: '💬' },
};

// 構想フェーズの4項目定義
const IDEATION_ITEMS = [
  {
    key: 'goal',
    icon: '🎯',
    label: 'ゴール',
    chipLabel: '🎯 ゴールを整理',
    chipMessage: 'このタスクのゴールを一緒に整理してほしい。何を達成すれば完了と言えるか考えたい。',
    // AI・ユーザーの発言にこれらのキーワードが含まれていれば、この項目が議論されたと判定
    keywords: /ゴール|目標|達成|完了条件|成功|成果物|ゴールイメージ|目指す|最終的に|完了と[言い]える|どうなったら/,
  },
  {
    key: 'content',
    icon: '📝',
    label: '内容',
    chipLabel: '📝 やることを洗い出す',
    chipMessage: 'このタスクでやるべきことを洗い出してほしい。何から手をつけるべきか一緒に考えたい。',
    keywords: /やること|作業|内容|手順|やるべき|ステップ|具体的に.*する|実施|アクション|進め方|何をする/,
  },
  {
    key: 'concerns',
    icon: '⚠️',
    label: '気になる点',
    chipLabel: '⚠️ リスクを確認',
    chipMessage: 'このタスクの懸念点やリスクを一緒に確認したい。見落としがないかチェックしたい。',
    keywords: /リスク|懸念|気になる|不安|障害|問題|課題|不明点|心配|ボトルネック|依存|注意/,
  },
  {
    key: 'deadline',
    icon: '📅',
    label: '期限',
    chipLabel: '📅 スケジュールを考える',
    chipMessage: 'このタスクのスケジュール感を考えたい。いつまでに何を終わらせるべきか整理したい。',
    keywords: /期限|いつまで|締め切り|スケジュール|日程|納期|マイルストーン|デッドライン|[0-9]+月|[0-9]+日|来週|今週/,
  },
] as const;

/**
 * 会話内容から構想4項目の充足状況を判定
 * AIの質問とユーザーの回答の両方が必要（AIが聞いて→ユーザーが答えた = 充足）
 */
function detectIdeationProgress(conversations: AiConversationMessage[]): Record<string, boolean> {
  const ideationConvs = conversations.filter(c => c.phase === 'ideation');
  const result: Record<string, boolean> = {
    goal: false,
    content: false,
    concerns: false,
    deadline: false,
  };

  for (const item of IDEATION_ITEMS) {
    // AIがこのトピックについて質問し、ユーザーが回答しているかチェック
    let aiAsked = false;
    let userResponded = false;

    for (const conv of ideationConvs) {
      if (conv.role === 'assistant' && item.keywords.test(conv.content)) {
        aiAsked = true;
      }
      // AIが聞いた後のユーザー発言をカウント
      if (aiAsked && conv.role === 'user' && conv.content.length >= 5) {
        userResponded = true;
      }
    }

    // ユーザーが自発的にこのトピックについて話している場合も充足とする
    const userMentioned = ideationConvs.some(
      c => c.role === 'user' && item.keywords.test(c.content) && c.content.length >= 10
    );

    result[item.key] = (aiAsked && userResponded) || userMentioned;
  }

  return result;
}

interface TaskAiChatProps {
  task: Task;
  onPhaseChange: (phase: TaskPhase) => void;
  onTaskUpdate: () => void;
}

export default function TaskAiChat({
  task,
  onPhaseChange,
  onTaskUpdate,
}: TaskAiChatProps) {
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ローカル会話状態（楽観的更新用）
  const [localConversations, setLocalConversations] = useState<AiConversationMessage[]>(
    task.conversations || []
  );
  const prevTaskIdRef = useRef(task.id);
  const prevConvLenRef = useRef((task.conversations || []).length);

  // タスク切り替え or サーバーからの会話更新を検知して同期
  useEffect(() => {
    const taskConvs = task.conversations || [];
    if (task.id !== prevTaskIdRef.current) {
      // タスクが切り替わった
      setLocalConversations(taskConvs);
      prevTaskIdRef.current = task.id;
      prevConvLenRef.current = taskConvs.length;
    } else if (taskConvs.length !== prevConvLenRef.current) {
      // 同じタスクだが、サーバーから新しい会話データが来た
      setLocalConversations(taskConvs);
      prevConvLenRef.current = taskConvs.length;
    }
  }, [task.id, task.conversations]);

  const phase = task.phase;
  const conversations = localConversations;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations.length]);

  // === 送信処理（楽観的更新付き） ===
  const sendMessage = async (message: string) => {
    if (!message.trim() || isSending) return;
    setIsSending(true);
    try {
      const res = await fetch('/api/tasks/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, message, phase }),
      });
      const data = await res.json();
      if (data.success) {
        // 楽観的更新: API応答をローカルに即反映
        const now = new Date().toISOString();
        setLocalConversations(prev => [
          ...prev,
          {
            id: `opt-u-${Date.now()}`,
            role: 'user' as const,
            content: message,
            phase,
            timestamp: now,
            conversationTag: data.data.conversationTag,
          },
          {
            id: `opt-a-${Date.now()}`,
            role: 'assistant' as const,
            content: data.data.reply,
            phase,
            timestamp: now,
          },
        ]);
        // バックグラウンドで全体リフレッシュ（DB同期）
        onTaskUpdate();
      }
    } catch {
      // エラー処理
    } finally {
      setIsSending(false);
    }
  };

  const handleSend = async () => {
    const msg = input;
    setInput('');
    // テキストエリアをリセット
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    await sendMessage(msg);
  };

  // Ctrl+Enter / Cmd+Enter で送信（Enterのみは改行）
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  // textarea 自動リサイズ
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, []);

  // === フェーズ遷移 ===
  const handlePhaseTransition = async (nextPhase: TaskPhase) => {
    try {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, phase: nextPhase }),
      });
      onPhaseChange(nextPhase);
      onTaskUpdate();
    } catch {
      // エラー処理
    }
  };

  const handleGenerateSummary = async () => {
    setIsGeneratingSummary(true);
    try {
      await fetch('/api/tasks/chat', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id }),
      });
      onTaskUpdate();
    } catch {
      // エラー処理
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleComplete = async () => {
    try {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, status: 'done' }),
      });
      onTaskUpdate();
    } catch {
      // エラー処理
    }
  };

  const handleQuickAction = async (prompt: string) => {
    await sendMessage(prompt);
  };

  const phaseMessages = (p: TaskPhase) =>
    conversations.filter((c) => c.phase === p);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* フェーズインジケータ */}
      <div className="px-4 py-3 border-b border-slate-100 bg-white shrink-0">
        <div className="flex items-center gap-1">
          {(Object.keys(TASK_PHASE_CONFIG) as TaskPhase[]).map((p, idx) => {
            const config = TASK_PHASE_CONFIG[p];
            const isActive = p === phase;
            const isPast =
              (phase === 'progress' && p === 'ideation') ||
              (phase === 'result' && p !== 'result');
            const hasMessages = phaseMessages(p).length > 0;

            return (
              <div key={p} className="flex items-center">
                {idx > 0 && (
                  <div
                    className={cn(
                      'w-6 h-0.5 mx-0.5 rounded-full',
                      isPast ? 'bg-blue-400' : 'bg-slate-200'
                    )}
                  />
                )}
                <button
                  onClick={() => {
                    if (isPast || isActive) return;
                  }}
                  className={cn(
                    'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
                    isActive
                      ? config.color + ' shadow-sm'
                      : isPast
                      ? 'bg-blue-50 text-blue-500'
                      : 'bg-slate-50 text-slate-400'
                  )}
                >
                  {config.icon} {config.label}
                  {hasMessages && (
                    <span className="text-[10px] opacity-60">
                      ({phaseMessages(p).length})
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== 構想フェーズ：進捗トラッカー ===== */}
      {phase === 'ideation' && conversations.length > 0 && (() => {
        const progress = detectIdeationProgress(conversations);
        const completedCount = Object.values(progress).filter(Boolean).length;
        return (
          <div className="mx-4 mt-2 mb-1 shrink-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-semibold text-amber-600">
                構想の進捗
              </span>
              <span className="text-[10px] text-slate-400">
                {completedCount}/4 項目
              </span>
              {/* プログレスバー */}
              <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${(completedCount / 4) * 100}%` }}
                />
              </div>
            </div>
            <div className="flex gap-1">
              {IDEATION_ITEMS.map(item => {
                const isDone = progress[item.key];
                return (
                  <button
                    key={item.key}
                    onClick={() => {
                      if (!isDone) sendMessage(item.chipMessage);
                    }}
                    disabled={isSending || isDone}
                    className={cn(
                      'flex items-center gap-0.5 px-2 py-1 rounded-md text-[10px] font-medium transition-all',
                      isDone
                        ? 'bg-green-50 text-green-600 border border-green-200'
                        : 'bg-slate-50 text-slate-400 border border-slate-200 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 cursor-pointer'
                    )}
                  >
                    {isDone ? '✅' : item.icon} {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* 構想メモ（既存データがあれば表示） */}
      {task.ideationSummary && (
        <div className="mx-4 mt-3 p-3 bg-gradient-to-br from-amber-50 to-amber-50/30 rounded-xl border border-amber-200 shrink-0">
          <span className="text-[10px] font-semibold text-amber-600">
            💡 構想メモ
          </span>
          <p className="text-xs text-amber-800 whitespace-pre-wrap leading-relaxed mt-1">
            {task.ideationSummary}
          </p>
        </div>
      )}

      {task.resultSummary && (
        <div className="mx-4 mt-3 p-3 bg-gradient-to-br from-green-50 to-green-50/30 rounded-xl border border-green-200 shrink-0">
          <div className="text-[10px] font-semibold text-green-600 mb-1">
            ✅ 結果要約
          </div>
          <p className="text-xs text-green-800 whitespace-pre-wrap leading-relaxed">
            {task.resultSummary}
          </p>
        </div>
      )}

      {/* 会話エリア */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3 bg-gradient-to-b from-slate-50/30 to-white">
        {/* ===== 構想フェーズ：AIウェルカム＋サジェストチップ ===== */}
        {phase === 'ideation' && conversations.length === 0 && (
          <div className="space-y-3">
            {/* AIウェルカムメッセージ */}
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-2.5 bg-white border border-slate-200 text-slate-800 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-semibold text-slate-400">🤖 AI</span>
                </div>
                <p className="text-[13px] whitespace-pre-wrap leading-relaxed">
                  このタスクの構想を一緒に練りましょう！{'\n\n'}まずは🎯ゴールから。{'\n'}「このタスクが完了したら、どんな状態になっていたら成功ですか？」{'\n\n'}一問一答で4つの項目（ゴール→内容→気になる点→期限）を{'\n'}順番に整理していきます。
                </p>
              </div>
            </div>
            {/* サジェストチップ */}
            <div className="flex flex-wrap gap-1.5 px-1">
              {IDEATION_ITEMS.map(item => (
                <button
                  key={item.key}
                  onClick={() => sendMessage(item.chipMessage)}
                  disabled={isSending}
                  className="text-[11px] px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
                >
                  {item.chipLabel}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 会話メッセージ */}
        {conversations.map((msg: AiConversationMessage) => (
          <div
            key={msg.id}
            className={cn(
              'flex',
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-4 py-2.5',
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-md'
                  : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md shadow-sm'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={cn(
                    'text-[10px] font-semibold',
                    msg.role === 'user' ? 'text-blue-100' : 'text-slate-400'
                  )}
                >
                  {msg.role === 'user' ? 'あなた' : '🤖 AI'}
                </span>
                <span
                  className={cn(
                    'text-[10px]',
                    msg.role === 'user' ? 'text-blue-200' : 'text-slate-300'
                  )}
                >
                  {formatRelativeTime(msg.timestamp)}
                </span>
                {msg.conversationTag && msg.conversationTag !== 'その他' && (() => {
                  const tagStyle = CONVERSATION_TAG_STYLE[msg.conversationTag];
                  return (
                    <span
                      className={cn(
                        'text-[9px] px-1.5 py-0.5 rounded-full font-medium',
                        msg.role === 'user'
                          ? 'bg-blue-500/30 text-blue-100'
                          : `${tagStyle.bg} ${tagStyle.text}`
                      )}
                    >
                      {tagStyle.icon} {msg.conversationTag}
                    </span>
                  );
                })()}
              </div>
              <p className="text-[13px] whitespace-pre-wrap leading-relaxed">
                {msg.content}
              </p>
            </div>
          </div>
        ))}

        {/* 送信中インジケータ */}
        {isSending && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
              <div className="flex items-center gap-1.5 text-slate-400">
                <span className="w-2 h-2 rounded-full bg-slate-300 animate-pulse" />
                <span className="w-2 h-2 rounded-full bg-slate-300 animate-pulse" style={{ animationDelay: '0.2s' }} />
                <span className="w-2 h-2 rounded-full bg-slate-300 animate-pulse" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ===== 進行フェーズ：クイックアクション ===== */}
      {phase === 'progress' && conversations.length > 0 && (
        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[10px] text-slate-400 shrink-0">AI補助:</span>
            {PROGRESS_QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                onClick={() => handleQuickAction(action.prompt)}
                disabled={isSending}
                className="shrink-0 text-[11px] px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 transition-all disabled:opacity-50"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* フェーズ遷移ボタン（構想→進行: 全4項目が充足している場合のみ表示） */}
      {phase === 'ideation' && (() => {
        const progress = detectIdeationProgress(conversations);
        const allDone = Object.values(progress).every(Boolean);
        const completedCount = Object.values(progress).filter(Boolean).length;

        if (conversations.length < 2) return null;

        return allDone ? (
          <div className="px-4 py-2.5 bg-gradient-to-r from-green-50 to-amber-50/50 border-t border-green-200 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs text-green-700">
                ✅ 構想の4項目が揃いました！進行フェーズへ移りましょう
              </span>
              <button
                onClick={() => handlePhaseTransition('progress')}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
              >
                🔄 進行フェーズへ
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 py-2 bg-slate-50/80 border-t border-slate-100 shrink-0">
            <span className="text-[11px] text-slate-400">
              💡 構想を進めましょう（{completedCount}/4 項目完了 — 全項目が揃うと進行フェーズに移れます）
            </span>
          </div>
        );
      })()}

      {phase === 'progress' && conversations.length >= 2 && (
        <div className="px-4 py-2.5 bg-gradient-to-r from-blue-50 to-blue-50/50 border-t border-blue-200 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-xs text-blue-700">
              作業が完了したら、結果をまとめましょう
            </span>
            <button
              onClick={() => handlePhaseTransition('result')}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
            >
              ✅ 結果フェーズへ
            </button>
          </div>
        </div>
      )}

      {phase === 'result' && (
        <div className="px-4 py-2.5 bg-gradient-to-r from-green-50 to-green-50/50 border-t border-green-200 shrink-0">
          <div className="flex items-center gap-2 justify-between">
            <span className="text-xs text-green-700">
              結果をまとめて完了にしましょう
            </span>
            <div className="flex gap-2">
              {!task.resultSummary && (
                <button
                  onClick={handleGenerateSummary}
                  disabled={isGeneratingSummary}
                  className="px-3 py-1.5 text-xs font-medium text-green-700 bg-white border border-green-200 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isGeneratingSummary ? '生成中...' : '📝 AIで要約'}
                </button>
              )}
              <button
                onClick={handleComplete}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
              >
                ✅ タスク完了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 入力エリア（下部固定） */}
      <div className="px-4 py-3 border-t border-slate-100 bg-white shrink-0">
        <p className="text-[10px] text-slate-300 mb-1">Ctrl+Enter で送信</p>
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResize(); }}
            onKeyDown={handleKeyDown}
            placeholder={
              phase === 'ideation'
                ? 'ゴールや考えていることを自由に入力...'
                : phase === 'progress'
                ? '進捗や気づきを入力...'
                : '結果や学びを入力...'
            }
            rows={1}
            className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none placeholder:text-slate-300 min-h-[40px] max-h-[160px]"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:bg-slate-200 disabled:text-slate-400 transition-colors shrink-0"
          >
            送信
          </button>
        </div>
      </div>
    </div>
  );
}
