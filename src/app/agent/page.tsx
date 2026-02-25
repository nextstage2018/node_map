// Phase 32: パーソナル秘書エージェント ページ
'use client';

import { useState, useRef, useEffect } from 'react';
import Header from '@/components/shared/Header';
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
    <div className="flex flex-col h-screen bg-white">
      <Header />

      <div className="flex-1 overflow-hidden flex flex-col">
        {/* ページヘッダー */}
        <div className="h-12 border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-600" />
            <h1 className="text-sm font-bold text-slate-900">パーソナル秘書</h1>
            <span className="text-xs text-slate-400">
              タスク・種・ナレッジを踏まえてサポートします
            </span>
          </div>
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              クリア
            </button>
          )}
        </div>

        {/* チャットエリア */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 ? (
            // Phase 32: ウェルカム画面
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                <Bot className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-2">
                パーソナル秘書
              </h2>
              <p className="text-sm text-slate-500 max-w-md mb-6">
                あなたのタスク・種・ナレッジを把握した上で、
                質問応答・タスク提案・情報整理をサポートします。
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg">
                {[
                  '今日やるべきことは？',
                  '優先度の高いタスクを教えて',
                  '最近の種を整理して',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                      inputRef.current?.focus();
                    }}
                    className="px-3 py-2 text-xs text-slate-600 bg-slate-50 hover:bg-blue-50 hover:text-blue-600 rounded-lg border border-slate-200 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            // Phase 32: メッセージ一覧
            <div className="max-w-2xl mx-auto space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="px-4 py-2.5 rounded-2xl bg-slate-100 text-slate-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin inline-block" />
                    <span className="ml-2">考え中...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* 入力エリア */}
        <div className="border-t border-slate-200 px-6 py-3 shrink-0">
          <div className="max-w-2xl mx-auto flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="秘書に質問する...（Shift+Enterで改行）"
              rows={1}
              className="flex-1 resize-none rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              style={{ maxHeight: '120px' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 120) + 'px';
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
