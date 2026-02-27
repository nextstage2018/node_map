// Phase Restructure: アイデアメモページ — 断片的な思いつきの場所
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { IdeaMemo } from '@/lib/types';
import AppLayout from '@/components/shared/AppLayout';
import ContextBar from '@/components/shared/ContextBar';
import Button from '@/components/ui/Button';
import { Plus, Trash2, MessageSquare, Send, X } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function MemosPage() {
  const [memos, setMemos] = useState<IdeaMemo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newContent, setNewContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // AI会話パネル
  const [selectedMemo, setSelectedMemo] = useState<IdeaMemo | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchMemos = useCallback(async () => {
    try {
      const res = await fetch('/api/memos');
      const json = await res.json();
      if (json.success) {
        setMemos(json.data || []);
      }
    } catch (e) {
      console.error('メモ取得エラー:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMemos();
  }, [fetchMemos]);

  // 会話履歴をスクロール
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleCreate = async () => {
    if (!newContent.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/memos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setMemos(prev => [json.data, ...prev]);
        setNewContent('');
      }
    } catch (e) {
      console.error('メモ作成エラー:', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/memos?id=${id}`, { method: 'DELETE' });
      setMemos(prev => prev.filter(m => m.id !== id));
      if (selectedMemo?.id === id) {
        setSelectedMemo(null);
        setChatMessages([]);
      }
    } catch (e) {
      console.error('メモ削除エラー:', e);
    }
  };

  const openChat = async (memo: IdeaMemo) => {
    setSelectedMemo(memo);
    setChatMessages([]);
    setChatInput('');

    // 会話履歴を取得
    try {
      const res = await fetch(`/api/memos/chat?memoId=${memo.id}`);
      const json = await res.json();
      if (json.success && json.data) {
        setChatMessages(json.data.map((msg: { role: string; content: string }) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })));
      }
    } catch (e) {
      console.error('会話履歴取得エラー:', e);
    }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || !selectedMemo || isChatLoading) return;
    const message = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: message }]);
    setIsChatLoading(true);

    try {
      const res = await fetch('/api/memos/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memoId: selectedMemo.id,
          message,
          memoContent: selectedMemo.content,
          history: chatMessages,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: json.data.reply }]);
      }
    } catch (e) {
      console.error('AI会話エラー:', e);
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'エラーが発生しました。もう一度お試しください。' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <AppLayout>
      <ContextBar
        title="アイデアメモ"
        subtitle="断片的な思いつきを気軽にメモ"
      />

      <div className="flex h-[calc(100vh-130px)]">
        {/* メモ一覧（左側） */}
        <div className={`${selectedMemo ? 'w-1/2 border-r' : 'w-full max-w-3xl mx-auto'} p-4 overflow-y-auto`}>
          {/* 新規メモ入力 */}
          <div className="mb-4">
            <textarea
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              placeholder="新しいアイデアをメモ..."
              className="w-full px-3 py-2 border rounded-lg text-sm resize-none"
              rows={3}
            />
            <div className="flex justify-end mt-1">
              <Button
                onClick={handleCreate}
                variant="primary"
                size="sm"
                disabled={isSubmitting || !newContent.trim()}
              >
                <Plus className="w-4 h-4 mr-1" />
                {isSubmitting ? '保存中...' : 'メモを追加'}
              </Button>
            </div>
          </div>

          {/* メモ一覧 */}
          {isLoading ? (
            <div className="text-center text-gray-400 py-8">読み込み中...</div>
          ) : memos.length === 0 ? (
            <div className="text-center text-gray-400 py-8">メモがありません</div>
          ) : (
            <div className="space-y-2">
              {memos.map(memo => (
                <div
                  key={memo.id}
                  className={`p-3 bg-white border rounded-lg hover:shadow-sm transition-shadow cursor-pointer ${
                    selectedMemo?.id === memo.id ? 'ring-2 ring-blue-300' : ''
                  }`}
                  onClick={() => openChat(memo)}
                >
                  <div className="text-sm text-gray-800 whitespace-pre-wrap line-clamp-3">
                    {memo.content}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="text-xs text-gray-400">
                      {new Date(memo.createdAt).toLocaleDateString('ja-JP')}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); openChat(memo); }}
                        className="text-gray-400 hover:text-blue-500"
                        title="AIと深掘り"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(memo.id); }}
                        className="text-gray-300 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI会話パネル（右側） */}
        {selectedMemo && (
          <div className="w-1/2 flex flex-col">
            {/* ヘッダー */}
            <div className="flex items-center justify-between p-3 border-b bg-gray-50">
              <div className="text-sm font-medium text-gray-700 truncate">
                💡 {selectedMemo.content.slice(0, 50)}{selectedMemo.content.length > 50 ? '...' : ''}
              </div>
              <button onClick={() => { setSelectedMemo(null); setChatMessages([]); }}>
                <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            {/* 会話履歴 */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {chatMessages.length === 0 && (
                <div className="text-center text-gray-400 text-sm py-8">
                  このメモについてAIに質問してみましょう
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                    msg.role === 'user'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 px-3 py-2 rounded-lg text-sm text-gray-400">
                    考え中...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* 入力欄 */}
            <div className="border-t p-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendChat()}
                  placeholder="メモについて質問や深掘り..."
                  className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  disabled={isChatLoading}
                />
                <button
                  onClick={handleSendChat}
                  disabled={isChatLoading || !chatInput.trim()}
                  className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
