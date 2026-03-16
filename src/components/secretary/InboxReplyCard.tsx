// v9.0: インボックス返信カード
// 未読メッセージ一覧 → 詳細表示 → AI返信生成 → 確認 → 返信実行
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Mail, MessageSquare, ChevronRight, Loader2, Send, Sparkles, X, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface InboxMessage {
  id: string;
  channel: string;
  from: {
    name: string;
    address: string;
  };
  subject?: string;
  body: string;
  timestamp: string;
  isRead: boolean;
  metadata?: Record<string, unknown>;
}

type ViewMode = 'list' | 'detail' | 'reply';

export default function InboxReplyCard() {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<InboxMessage | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [replyDraft, setReplyDraft] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<'success' | 'error' | null>(null);

  const fetchUnreadMessages = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/messages?limit=20&direction=received');
      const data = await res.json();
      if (data.success && data.data) {
        // 未読のみフィルタ＋最大10件
        const unread = data.data
          .filter((m: InboxMessage) => !m.isRead)
          .slice(0, 10);
        setMessages(unread);
      }
    } catch { /* ignore */ }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => {
    fetchUnreadMessages();
  }, [fetchUnreadMessages]);

  // メッセージ選択→詳細表示
  const handleSelect = async (msg: InboxMessage) => {
    setSelectedMessage(msg);
    setViewMode('detail');
    setReplyDraft('');
    setSendResult(null);

    // 既読にする
    try {
      await fetch('/api/messages/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: msg.id }),
      });
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    } catch { /* ignore */ }
  };

  // AI返信生成
  const handleGenerateReply = async () => {
    if (!selectedMessage) return;
    setIsGenerating(true);
    try {
      const res = await fetch('/api/ai/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: selectedMessage.channel,
          fromAddress: selectedMessage.from.address,
          fromName: selectedMessage.from.name,
          subject: selectedMessage.subject,
          body: selectedMessage.body,
          metadata: selectedMessage.metadata,
        }),
      });
      const data = await res.json();
      if (data.success && data.data?.draft) {
        setReplyDraft(data.data.draft);
        setViewMode('reply');
      }
    } catch { /* ignore */ }
    finally { setIsGenerating(false); }
  };

  // 返信送信
  const handleSendReply = async () => {
    if (!selectedMessage || !replyDraft) return;
    setIsSending(true);
    setSendResult(null);
    try {
      const res = await fetch('/api/messages/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: selectedMessage.id,
          channel: selectedMessage.channel,
          body: replyDraft,
          metadata: selectedMessage.metadata,
        }),
      });
      const data = await res.json();
      setSendResult(data.success ? 'success' : 'error');
      if (data.success) {
        // 2秒後にリストに戻る
        setTimeout(() => {
          setViewMode('list');
          setSelectedMessage(null);
          setSendResult(null);
        }, 2000);
      }
    } catch {
      setSendResult('error');
    }
    finally { setIsSending(false); }
  };

  // リストに戻る
  const handleBack = () => {
    setViewMode('list');
    setSelectedMessage(null);
    setReplyDraft('');
    setSendResult(null);
  };

  const channelIcon = (channel: string) => {
    if (channel === 'slack') return <div className="w-5 h-5 rounded bg-purple-100 flex items-center justify-center text-[10px] font-bold text-purple-600">S</div>;
    if (channel === 'chatwork') return <div className="w-5 h-5 rounded bg-orange-100 flex items-center justify-center text-[10px] font-bold text-orange-600">C</div>;
    return <Mail className="w-4 h-4 text-slate-400" />;
  };

  const timeAgo = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return `${Math.floor(diff / (1000 * 60))}分前`;
    if (hours < 24) return `${hours}時間前`;
    return `${Math.floor(hours / 24)}日前`;
  };

  return (
    <div className="bg-nm-surface rounded-xl border border-nm-border shadow-sm flex flex-col" style={{ minHeight: '400px' }}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-nm-border">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-nm-primary" />
          <span className="text-sm font-medium text-nm-text">インボックス</span>
          {messages.length > 0 && (
            <span className="text-[10px] font-medium text-white bg-nm-primary rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
              {messages.length}
            </span>
          )}
        </div>
        {viewMode !== 'list' ? (
          <button onClick={handleBack} className="text-xs text-nm-text-secondary hover:text-nm-text transition-colors flex items-center gap-1">
            <X className="w-3.5 h-3.5" />
            閉じる
          </button>
        ) : (
          <Link href="/inbox" className="text-xs text-nm-primary hover:text-nm-primary-hover transition-colors flex items-center gap-1">
            すべて見る
            <ExternalLink className="w-3 h-3" />
          </Link>
        )}
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto">
        {/* リスト表示 */}
        {viewMode === 'list' && (
          <>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 text-nm-text-muted animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-nm-text-muted">
                <Mail className="w-8 h-8 mb-2 opacity-40" />
                <span className="text-xs">未読メッセージはありません</span>
              </div>
            ) : (
              <div className="divide-y divide-nm-border">
                {messages.map((msg) => (
                  <button
                    key={msg.id}
                    onClick={() => handleSelect(msg)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-start gap-3"
                  >
                    {channelIcon(msg.channel)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-nm-text truncate">{msg.from.name || msg.from.address}</span>
                        <span className="text-[10px] text-nm-text-muted shrink-0">{timeAgo(msg.timestamp)}</span>
                      </div>
                      <p className="text-[11px] text-nm-text-secondary mt-0.5 line-clamp-2">
                        {msg.subject || msg.body?.slice(0, 80)}
                      </p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-nm-text-muted mt-1 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* 詳細表示 */}
        {viewMode === 'detail' && selectedMessage && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              {channelIcon(selectedMessage.channel)}
              <div>
                <p className="text-xs font-medium text-nm-text">{selectedMessage.from.name}</p>
                <p className="text-[10px] text-nm-text-muted">{selectedMessage.from.address} · {timeAgo(selectedMessage.timestamp)}</p>
              </div>
            </div>
            {selectedMessage.subject && (
              <p className="text-xs font-medium text-nm-text">{selectedMessage.subject}</p>
            )}
            <div className="bg-slate-50 rounded-lg p-3 max-h-48 overflow-y-auto">
              <p className="text-[11px] text-nm-text-secondary whitespace-pre-wrap leading-relaxed">
                {selectedMessage.body?.slice(0, 1000)}
              </p>
            </div>
            <button
              onClick={handleGenerateReply}
              disabled={isGenerating}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-nm-primary text-white rounded-lg text-xs font-medium hover:bg-nm-primary-hover disabled:opacity-50 transition-colors"
            >
              {isGenerating ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" />返信を生成中...</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5" />AI返信を生成</>
              )}
            </button>
          </div>
        )}

        {/* 返信編集・送信 */}
        {viewMode === 'reply' && selectedMessage && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              {channelIcon(selectedMessage.channel)}
              <p className="text-xs text-nm-text-secondary">
                {selectedMessage.from.name} への返信
              </p>
            </div>
            <textarea
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              rows={8}
              className="w-full text-[11px] border border-nm-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-nm-primary resize-none leading-relaxed"
            />
            {sendResult === 'success' && (
              <div className="text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2 text-center">
                返信を送信しました
              </div>
            )}
            {sendResult === 'error' && (
              <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 text-center">
                送信に失敗しました
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleGenerateReply}
                disabled={isGenerating}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 text-nm-text-secondary rounded-lg text-xs hover:bg-slate-200 disabled:opacity-50 transition-colors"
              >
                <Sparkles className="w-3 h-3" />
                再生成
              </button>
              <button
                onClick={handleSendReply}
                disabled={isSending || !replyDraft}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-nm-primary text-white rounded-lg text-xs font-medium hover:bg-nm-primary-hover disabled:opacity-50 transition-colors"
              >
                {isSending ? (
                  <><Loader2 className="w-3 h-3 animate-spin" />送信中...</>
                ) : (
                  <><Send className="w-3 h-3" />返信する</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
