'use client';

import { useState, useRef, useEffect } from 'react';
import { Task, TaskPhase, AiConversationMessage } from '@/lib/types';
import {
  TASK_PHASE_CONFIG,
  IDEATION_MEMO_FIELDS,
  PROGRESS_QUICK_ACTIONS,
} from '@/lib/constants';
import { cn, formatRelativeTime } from '@/lib/utils';
import Button from '@/components/ui/Button';

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

  // 構想メモフォーム
  const [ideationForm, setIdeationForm] = useState<Record<string, string>>({
    goal: '',
    content: '',
    concerns: '',
    deadline: '',
  });
  const [showIdeationForm, setShowIdeationForm] = useState(true);

  const phase = task.phase;
  const conversations = task.conversations;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations.length]);

  // === 送信処理 ===
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
      if (data.success) onTaskUpdate();
    } catch {
      // エラー処理
    } finally {
      setIsSending(false);
    }
  };

  const handleSend = async () => {
    await sendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // === 構想メモ送信 ===
  const handleIdeationSubmit = async () => {
    const parts: string[] = [];
    if (ideationForm.goal) parts.push(`【ゴール】${ideationForm.goal}`);
    if (ideationForm.content) parts.push(`【主な内容】${ideationForm.content}`);
    if (ideationForm.concerns) parts.push(`【気になる点】${ideationForm.concerns}`);
    if (ideationForm.deadline) parts.push(`【期限日】${ideationForm.deadline}`);

    if (parts.length === 0) return;

    const message = parts.join('\n');
    setShowIdeationForm(false);

    // 構想メモをideationSummaryにも保存
    try {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, ideationSummary: message }),
      });
    } catch {
      // エラー処理
    }

    await sendMessage(message);
  };

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

  // === クイックアクション送信 ===
  const handleQuickAction = async (prompt: string) => {
    await sendMessage(prompt);
  };

  const showIdeationFormUI =
    phase === 'ideation' && conversations.length === 0 && showIdeationForm;

  const phaseMessages = (p: TaskPhase) =>
    conversations.filter((c) => c.phase === p);

  return (
    <div className="flex flex-col h-full">
      {/* フェーズインジケータ */}
      <div className="px-4 py-3 border-b border-slate-200 bg-white">
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
                      'w-8 h-0.5 mx-1',
                      isPast ? 'bg-blue-400' : 'bg-slate-200'
                    )}
                  />
                )}
                <button
                  onClick={() => {
                    if (isPast || isActive) return;
                  }}
                  className={cn(
                    'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                    isActive
                      ? config.color
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

      {/* 構想メモ（進行・結果フェーズで表示） */}
      {task.ideationSummary && phase !== 'ideation' && (
        <div className="mx-4 mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
          <div className="text-[10px] font-semibold text-amber-600 mb-1">
            💡 構想メモ
          </div>
          <p className="text-xs text-amber-800 whitespace-pre-wrap">
            {task.ideationSummary}
          </p>
        </div>
      )}

      {task.resultSummary && (
        <div className="mx-4 mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
          <div className="text-[10px] font-semibold text-green-600 mb-1">
            ✅ 結果要約
          </div>
          <p className="text-xs text-green-800 whitespace-pre-wrap">
            {task.resultSummary}
          </p>
        </div>
      )}

      {/* 会話エリア */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* ===== 構想フェーズ：構造化フォーム ===== */}
        {showIdeationFormUI && (
          <div className="bg-white border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm">💡</span>
              <h3 className="text-sm font-bold text-slate-800">構想メモを入力</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              各項目を埋めると、AIがタスクの進め方を一緒に考えます。
            </p>
            <div className="space-y-3">
              {IDEATION_MEMO_FIELDS.map((field) => (
                <div key={field.key}>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1">
                    <span>{field.icon}</span>
                    {field.label}
                  </label>
                  {field.key === 'deadline' ? (
                    <input
                      type="date"
                      value={ideationForm[field.key]}
                      onChange={(e) =>
                        setIdeationForm((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                    />
                  ) : (
                    <textarea
                      value={ideationForm[field.key]}
                      onChange={(e) =>
                        setIdeationForm((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                      placeholder={field.placeholder}
                      rows={field.key === 'goal' ? 2 : 1}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-none"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowIdeationForm(false)}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                フリー入力にする
              </button>
              <div className="flex-1" />
              <Button
                onClick={handleIdeationSubmit}
                disabled={!ideationForm.goal.trim()}
              >
                AIに送信
              </Button>
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
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
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
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex items-center gap-1 text-slate-400">
                <span className="animate-pulse">●</span>
                <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>●</span>
                <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>●</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ===== 進行フェーズ：クイックアクション ===== */}
      {phase === 'progress' && conversations.length > 0 && (
        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[10px] text-slate-400 shrink-0">AI補助:</span>
            {PROGRESS_QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                onClick={() => handleQuickAction(action.prompt)}
                disabled={isSending}
                className="shrink-0 text-[11px] px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 transition-colors disabled:opacity-50"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* フェーズ遷移ボタン */}
      {phase === 'ideation' && conversations.length >= 2 && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-200">
          <div className="flex items-center justify-between">
            <span className="text-xs text-amber-700">
              構想がまとまったら、進行フェーズに移りましょう
            </span>
            <Button
              onClick={() => handlePhaseTransition('progress')}
              className="text-xs"
            >
              🔄 進行フェーズへ
            </Button>
          </div>
        </div>
      )}

      {phase === 'progress' && conversations.length >= 2 && (
        <div className="px-4 py-2 bg-blue-50 border-t border-blue-200">
          <div className="flex items-center justify-between">
            <span className="text-xs text-blue-700">
              作業が完了したら、結果をまとめましょう
            </span>
            <Button
              onClick={() => handlePhaseTransition('result')}
              className="text-xs"
            >
              ✅ 結果フェーズへ
            </Button>
          </div>
        </div>
      )}

      {phase === 'result' && (
        <div className="px-4 py-2 bg-green-50 border-t border-green-200">
          <div className="flex items-center gap-2 justify-between">
            <span className="text-xs text-green-700">
              結果をまとめて完了にしましょう
            </span>
            <div className="flex gap-2">
              {!task.resultSummary && (
                <Button
                  variant="secondary"
                  onClick={handleGenerateSummary}
                  disabled={isGeneratingSummary}
                  className="text-xs"
                >
                  {isGeneratingSummary ? '生成中...' : '📝 AIで要約'}
                </Button>
              )}
              <Button onClick={handleComplete} className="text-xs">
                ✅ タスク完了
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 入力エリア */}
      <div className="px-4 py-3 border-t border-slate-200 bg-white">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              phase === 'ideation'
                ? 'ゴールイメージや関連要素を入力...'
                : phase === 'progress'
                ? '進捗や気づきを入力...'
                : '結果や学びを入力...'
            }
            rows={1}
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
          >
            送信
          </Button>
        </div>
      </div>
    </div>
  );
}
