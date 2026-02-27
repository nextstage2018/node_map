// Phase 32: パーソナル秘書エージェント ページ
'use client';

import { useState, useRef, useEffect } from 'react';
import AppLayout from '@/components/shared/AppLayout';
import ContextBar from '@/components/shared/ContextBar';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { Bot, Send, Loader2, Trash2 } from 'lucide-react';

// Phase 32: チャットメッセージの型
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function AgentPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Phase 32: メッセージ末尾にスクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Phase 32: 秘書エージェントにメッセージ送信
  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: messages,
        }),
      });
      const data = await res.json();
      if (data.success && data.data?.reply) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.data.reply },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.error || 'エラーが発生しました' },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '通信エラーが発生しました' },
      ]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  // Phase 32: Enterキーで送信（Shift+Enterで改行）
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Phase 32: 会話クリア
  const handleClear = () => {
    setMessages([]);
  };

  return (
    <AppLayout>
      <ContextBar
        title="秘書"
        actions={
          messages.length > 0 && (
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={handleClear}
            >
              クリア
            </Button>
          )
        }
      />

      <div className="flex-1 overflow-hidden flex flex-col">

        {/* チャットエリア */}
        <div className="flex-1 overflow-y-auto px-4 py-6 bg-gradient-to-b from-slate-50 to-white">
          {messages.length === 0 ? (
            // Phase 32: ウェルカム画面
            <EmptyState
              icon={<Bot className="w-12 h-12" />}
              title="パーソナル秘書"
              description="あなたのタスク・種・ナレッジを把握した上で、質問応答・タスク提案・情報整理をサポートします。"
              action={
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-lg">
                  {[
                    '今日やるべきことは？',
                    '優先度の高いタスクを教えて',
                    '最近の種を整理して',
                  ].map((suggestion) => (
                    <Button
                      key={suggestion}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setInput(suggestion);
                        inputRef.current?.focus();
                      }}
                      className="text-xs"
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              }
              className="h-full"
            />
          ) : (
            // Phase 32: メッセージ一覧
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0 shadow-sm">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div
                    className={`max-w-[70%] px-4 py-3 rounded-lg text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-none'
                        : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0 shadow-sm">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="px-4 py-3 rounded-lg bg-white border border-slate-200 text-slate-500 text-sm flex items-center gap-2 rounded-bl-none shadow-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>考え中...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* 入力エリア */}
        <div className="border-t border-slate-200 bg-white px-4 py-4 shrink-0">
          <div className="max-w-3xl mx-auto flex items-end gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="秘書に質問する...（Shift+Enterで改行）"
              rows={1}
              className="flex-1 resize-none rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              style={{ maxHeight: '120px' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 120) + 'px';
              }}
            />
            <Button
              variant="primary"
              size="md"
              icon={<Send className="w-4 h-4" />}
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="shrink-0 rounded-lg px-4"
            />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
