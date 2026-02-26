// Phase 31: 種ボックス — AI会話強化
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Seed, SeedStatus } from '@/lib/types';
import Header from '@/components/shared/Header';
import SeedCard from '@/components/seeds/SeedCard';
import SeedTagInput from '@/components/seeds/SeedTagInput';
import { Send, X, BookOpen, CheckSquare, MessageSquare } from 'lucide-react';

type StatusFilter = SeedStatus | 'all';

// Phase 31: AI会話メッセージ
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function SeedsPage() {
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTags, setNewTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Phase 31: AI会話パネル
  const [selectedSeed, setSelectedSeed] = useState<Seed | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [convertResult, setConvertResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 会話末尾にスクロール
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // 種の取得
  const fetchSeeds = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('status', statusFilter);
      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }

      const res = await fetch(`/api/seeds?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setSeeds(data.data);
      }
    } catch {
      // サイレント
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    fetchSeeds();
  }, [fetchSeeds]);

  // 種の作成
  const handleCreate = async () => {
    if (!newContent.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/seeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newContent.trim(),
          tags: newTags.length > 0 ? newTags : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSeeds((prev) => [data.data, ...prev]);
        setNewContent('');
        setNewTags([]);
      }
    } catch {
      // サイレント
    } finally {
      setIsSubmitting(false);
    }
  };

  // 種の更新
  const handleUpdate = async (seedId: string, content: string, tags: string[]) => {
    try {
      const res = await fetch('/api/seeds', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedId, content, tags }),
      });
      const data = await res.json();
      if (data.success) {
        setSeeds((prev) => prev.map((s) => (s.id === seedId ? data.data : s)));
      }
    } catch {
      // サイレント
    }
  };

  // 種の削除
  const handleDelete = async (seedId: string) => {
    try {
      const res = await fetch(`/api/seeds?seedId=${seedId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setSeeds((prev) => prev.filter((s) => s.id !== seedId));
        if (selectedSeed?.id === seedId) {
          setSelectedSeed(null);
          setChatMessages([]);
        }
      }
    } catch {
      // サイレント
    }
  };

  // 種のタスク化（既存）
  const handleConfirm = async (seedId: string) => {
    try {
      const res = await fetch(`/api/seeds/${seedId}/confirm`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setSeeds((prev) => prev.filter((s) => s.id !== seedId));
        if (selectedSeed?.id === seedId) {
          setSelectedSeed(null);
          setChatMessages([]);
        }
      }
    } catch {
      // サイレント
    }
  };

  // Phase 31: AI会話送信
  const handleChatSend = async () => {
    if (!chatInput.trim() || !selectedSeed || isChatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsChatLoading(true);

    try {
      const res = await fetch('/api/seeds/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seedId: selectedSeed.id,
          seedContent: selectedSeed.content,
          message: userMessage,
          history: chatMessages,
        }),
      });
      const data = await res.json();
      if (data.success && data.data?.reply) {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: data.data.reply }]);
      } else {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: '応答を取得できませんでした。' }]);
      }
    } catch {
      setChatMessages((prev) => [...prev, { role: 'assistant', content: '通信エラーが発生しました。' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Phase 31: 種の変換（ナレッジ or タスク）
  const handleConvert = async (targetType: 'knowledge' | 'task') => {
    if (!selectedSeed || isConverting) return;
    setIsConverting(true);
    setConvertResult(null);

    try {
      const res = await fetch('/api/seeds/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedId: selectedSeed.id, targetType }),
      });
      const data = await res.json();
      if (data.success) {
        const label = targetType === 'knowledge' ? 'ナレッジ' : 'タスク';
        setConvertResult({ type: 'success', text: `${label}に変換しました` });
        // 種一覧を更新（confirmedに変わるため）
        setSeeds((prev) => prev.filter((s) => s.id !== selectedSeed.id));
        setTimeout(() => {
          setSelectedSeed(null);
          setChatMessages([]);
          setConvertResult(null);
        }, 1500);
      } else {
        setConvertResult({ type: 'error', text: data.error || '変換に失敗しました' });
      }
    } catch {
      setConvertResult({ type: 'error', text: '通信エラーが発生しました' });
    } finally {
      setIsConverting(false);
    }
  };

  // Phase 31+40b: 種を選択してAI会話パネルを開く（過去の会話を読み込み）
  const openChat = async (seed: Seed) => {
    setSelectedSeed(seed);
    setChatMessages([]);
    setConvertResult(null);
    setChatInput('');

    // Phase 40b: DB から過去の会話履歴を読み込み
    try {
      const res = await fetch(`/api/seeds/chat?seedId=${seed.id}`);
      const data = await res.json();
      if (data.success && data.data && data.data.length > 0) {
        setChatMessages(data.data);
      }
    } catch {
      // 読み込み失敗時はサイレント（空の会話パネルで開始）
    }
  };

  // 全タグのユニークリスト
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    seeds.forEach((s) => (s.tags || []).forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [seeds]);

  const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: '全て' },
    { key: 'pending', label: '保留中' },
    { key: 'confirmed', label: '確定済み' },
  ];

  return (
    <div className="flex flex-col h-screen bg-white">
      <Header />
      <div className="flex-1 overflow-hidden flex">
        {/* ========================================
            左: 種一覧
            ======================================== */}
        <div className={`flex-1 overflow-y-auto bg-slate-50 ${selectedSeed ? 'border-r border-slate-200' : ''}`}>
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
            {/* ページヘッダー */}
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <span>{'\uD83C\uDF31'}</span>
                種ボックス
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                アイデアやメモを種として記録し、タスクに育てましょう。
              </p>
            </div>

            {/* 新規入力フォーム */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="新しい種を入力..."
                rows={3}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  placeholder:text-slate-400 resize-none"
              />
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 mb-1">タグ</label>
                  <SeedTagInput tags={newTags} onChange={setNewTags} />
                </div>
                <button
                  onClick={handleCreate}
                  disabled={!newContent.trim() || isSubmitting}
                  className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg
                    hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors whitespace-nowrap"
                >
                  {isSubmitting ? '追加中...' : '種を追加'}
                </button>
              </div>
            </div>

            {/* フィルタバー */}
            <div className="flex items-center gap-4">
              <div className="flex bg-white rounded-lg border border-slate-200 p-0.5">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setStatusFilter(opt.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      statusFilter === opt.key
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="種を検索..."
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                    placeholder:text-slate-400"
                />
              </div>
              <span className="text-xs text-slate-400">{seeds.length}件</span>
            </div>

            {/* タグフィルタ */}
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setSearchQuery(tag)}
                    className="px-2 py-0.5 text-[10px] bg-slate-100 text-slate-600
                      rounded-full hover:bg-blue-50 hover:text-blue-600 transition-colors"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}

            {/* 種一覧 */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
                <span className="ml-2 text-sm text-slate-500">読み込み中...</span>
              </div>
            ) : seeds.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {seeds.map((seed) => (
                  <div key={seed.id} className="relative">
                    <SeedCard
                      seed={seed}
                      onConfirm={() => handleConfirm(seed.id)}
                      onUpdate={(content, tags) => handleUpdate(seed.id, content, tags)}
                      onDelete={() => handleDelete(seed.id)}
                    />
                    {/* Phase 31: AI会話ボタン */}
                    <button
                      onClick={() => openChat(seed)}
                      className={`absolute top-2 right-2 p-1.5 rounded-lg transition-colors ${
                        selectedSeed?.id === seed.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-white/80 text-slate-400 hover:text-blue-600 hover:bg-blue-50 border border-slate-200'
                      }`}
                      title="AIと会話"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-slate-400 text-sm">
                  {searchQuery || statusFilter !== 'all'
                    ? '条件に一致する種がありません。'
                    : '種はまだありません。上のフォームからアイデアを入力してみましょう。'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ========================================
            右: AI会話パネル
            ======================================== */}
        {selectedSeed && (
          <div className="w-96 flex flex-col bg-white shrink-0">
            {/* パネルヘッダー */}
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0 mr-2">
                  <h3 className="text-sm font-bold text-slate-900 truncate">AI会話</h3>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{selectedSeed.content}</p>
                </div>
                <button onClick={() => { setSelectedSeed(null); setChatMessages([]); }} className="text-slate-400 hover:text-slate-600 shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 会話履歴 */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {chatMessages.length === 0 && (
                <div className="text-center py-8">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-xs text-slate-400">
                    この種についてAIと会話できます。
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    「このアイデアを深掘りして」「具体的なステップは？」など聞いてみましょう。
                  </p>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 text-slate-400 px-3 py-2 rounded-lg text-sm">
                    <span className="animate-pulse">考え中...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* 変換結果バナー */}
            {convertResult && (
              <div className={`mx-4 mb-2 px-3 py-2 rounded-lg text-xs font-medium ${
                convertResult.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {convertResult.text}
              </div>
            )}

            {/* 入力欄 */}
            <div className="px-4 py-3 border-t border-slate-200">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); } }}
                  placeholder="メッセージを入力..."
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isChatLoading}
                />
                <button
                  onClick={handleChatSend}
                  disabled={!chatInput.trim() || isChatLoading}
                  className="p-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>

              {/* Phase 31: 変換ボタン */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => handleConvert('knowledge')}
                  disabled={isConverting}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50 transition-colors"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  ナレッジに変換
                </button>
                <button
                  onClick={() => handleConvert('task')}
                  disabled={isConverting}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  タスクに変換
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
