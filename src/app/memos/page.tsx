// アイデアメモページ — メモ→タスク直接変換対応
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { IdeaMemo } from '@/lib/types';
import AppLayout from '@/components/shared/AppLayout';
import ContextBar from '@/components/shared/ContextBar';
import Button from '@/components/ui/Button';
import { Plus, Trash2, MessageSquare, Send, X, ClipboardList } from 'lucide-react';

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

  // タスク化モーダル
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [convertMemoId, setConvertMemoId] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedTaskType, setSelectedTaskType] = useState<'personal' | 'group'>('personal');
  const [selectedDueDate, setSelectedDueDate] = useState<string>('');
  const [convertResult, setConvertResult] = useState<{ title: string; description: string; priority: string } | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      const json = await res.json();
      if (json.success) setProjects(json.data || []);
    } catch (e) { /* ignore */ }
  }, []);

  const handleConvertToTask = async () => {
    if (!convertMemoId || isConverting) return;
    setIsConverting(true);
    setConvertResult(null);
    try {
      const res = await fetch(`/api/memos/${convertMemoId}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId || null,
          taskType: selectedTaskType,
          dueDate: selectedDueDate || null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setConvertResult(json.data.task);
      } else {
        alert('変換に失敗しました: ' + (json.error || ''));
      }
    } catch (e) {
      console.error('タスク化エラー:', e);
      alert('変換に失敗しました');
    } finally {
      setIsConverting(false);
    }
  };

  const closeConvertModal = () => {
    setShowConvertModal(false);
    setConvertMemoId(null);
    setConvertResult(null);
  };

  const openConvertModal = (memoId: string) => {
    setConvertMemoId(memoId);
    setSelectedProjectId('');
    setSelectedTaskType('personal');
    setSelectedDueDate('');
    setConvertResult(null);
    setShowConvertModal(true);
    fetchProjects();
  };

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
                        onClick={(e) => { e.stopPropagation(); openConvertModal(memo.id); }}
                        className="text-gray-400 hover:text-blue-500"
                        title="タスクにする"
                      >
                        <ClipboardList className="w-4 h-4" />
                      </button>
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

      {/* タスク化モーダル */}
      {showConvertModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeConvertModal}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            {/* 変換結果表示 */}
            {convertResult ? (
              <>
                <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                  <span className="text-green-500">✓</span> タスクを作成しました
                </h3>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4 space-y-2">
                  <div>
                    <span className="text-xs text-gray-500">タイトル</span>
                    <p className="text-sm font-medium text-gray-800">{convertResult.title}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">説明</span>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{convertResult.description}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">優先度</span>
                    <span className={`ml-1 text-xs px-2 py-0.5 rounded-full ${
                      convertResult.priority === 'high' ? 'bg-red-100 text-red-700' :
                      convertResult.priority === 'low' ? 'bg-gray-100 text-gray-600' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {convertResult.priority === 'high' ? '高' : convertResult.priority === 'low' ? '低' : '中'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={closeConvertModal}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    閉じる
                  </button>
                  <a
                    href="/tasks"
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    タスクを見る
                  </a>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold mb-2">📋 タスクに変換</h3>
                <p className="text-sm text-gray-500 mb-4">
                  AIがメモとAI会話の内容からタスクのタイトル・説明・優先度を自動で作成します。
                </p>

                {/* タスクの種類 */}
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">タスクの種類</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedTaskType('personal')}
                      className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                        selectedTaskType === 'personal'
                          ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      👤 個人タスク
                    </button>
                    <button
                      onClick={() => setSelectedTaskType('group')}
                      className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                        selectedTaskType === 'group'
                          ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      👥 グループタスク
                    </button>
                  </div>
                </div>

                {/* プロジェクト */}
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">プロジェクト</label>
                  <select
                    value={selectedProjectId}
                    onChange={e => setSelectedProjectId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="">未指定</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* 期限日 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">期限日</label>
                  <input
                    type="date"
                    value={selectedDueDate}
                    onChange={e => setSelectedDueDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>

                <div className="flex gap-2 justify-end">
                  <button
                    onClick={closeConvertModal}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleConvertToTask}
                    disabled={isConverting}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                  >
                    {isConverting ? (
                      <>
                        <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                        AIが作成中...
                      </>
                    ) : (
                      '📋 タスクにする'
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
