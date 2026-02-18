'use client';

import { useState, useRef, useEffect } from 'react';
import { Task, TaskPhase, AiConversationMessage } from '@/lib/types';
import { TASK_PHASE_CONFIG, IDEATION_PROMPTS } from '@/lib/constants';
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

  const phase = task.phase;
  const phaseConfig = TASK_PHASE_CONFIG[phase];
  const conversations = task.conversations;

  // 会話が追加されたら下にスクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations.length]);

  const handleSend = async () => {
    if (!input.trim() || isSending) return;

    const message = input.trim();
    setInput('');
    setIsSending(true);

    try {
      const res = await fetch('/api/tasks/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          message,
          phase,
        }),
      });
      const data = await res.json();
      if (data.success) {
        onTaskUpdate(); // 親に更新を通知
      }
    } catch {
      // エラー処理
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

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

  // 構想フェーズで会話がない場合、誘導質問を表示
  const showIdeationPrompt =
    phase === 'ideation' && conversations.length === 0;

  // フェーズごとのメッセージをグループ化
  const phaseMessages = (p: TaskPhase) =>
    conversations.filter((c) => c.phase === p);

  return (
    <div className="flex flex-col h-full">
      {/* フェーズインジケータ */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
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
                      isPast ? 'bg-blue-400' : 'bg-gray-200'
                    )}
                  />
                )}
                <button
                  onClick={() => {
                    if (isPast || isActive) return;
                    // 前方遷移のみ許可（構想→進行→結果）
                  }}
                  className={cn(
                    'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                    isActive
                      ? config.color
                      : isPast
                      ? 'bg-blue-50 text-blue-500'
                      : 'bg-gray-50 text-gray-400'
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

      {/* 構想/結果要約 */}
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
        {/* 構想フェーズの誘導質問 */}
        {showIdeationPrompt && (
          <div className="flex justify-start">
            <div className="max-w-[85%] bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="text-[10px] text-gray-400 mb-1">
                🤖 AIアシスタント
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">
                {IDEATION_PROMPTS[0]}
              </p>
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
                  : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={cn(
                    'text-[10px] font-semibold',
                    msg.role === 'user' ? 'text-blue-100' : 'text-gray-400'
                  )}
                >
                  {msg.role === 'user' ? 'あなた' : '🤖 AI'}
                </span>
                <span
                  className={cn(
                    'text-[10px]',
                    msg.role === 'user' ? 'text-blue-200' : 'text-gray-300'
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
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex items-center gap-1 text-gray-400">
                <span className="animate-pulse">●</span>
                <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>●</span>
                <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>●</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

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
      <div className="px-4 py-3 border-t border-gray-200 bg-white">
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
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
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
