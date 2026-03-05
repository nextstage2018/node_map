'use client';

import { useState, useEffect } from 'react';
import { formatRelativeTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import ChannelBadge from '@/components/ui/ChannelBadge';
import type { ChannelType } from '@/lib/types';

interface HistoryMessage {
  id: string;
  channel: ChannelType;
  fromName: string;
  fromAddress: string;
  subject: string;
  body: string;
  direction: 'sent' | 'received';
  isRead: boolean;
  timestamp: string;
}

interface ContactHistoryPanelProps {
  fromAddress: string;
  fromName: string;
  currentMessageId: string;
}

/**
 * Phase B: 過去のやり取り変遷パネル
 * メッセージ詳細の右カラムに表示。相手との過去のやり取りを時系列で表示。
 */
export default function ContactHistoryPanel({ fromAddress, fromName, currentMessageId }: ContactHistoryPanelProps) {
  const [history, setHistory] = useState<HistoryMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    if (!fromAddress) {
      setIsLoading(false);
      return;
    }

    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          fromAddress,
          excludeId: currentMessageId,
          limit: '20',
        });
        const res = await fetch(`/api/messages/history?${params}`);
        const json = await res.json();
        if (json.success && json.data) {
          setHistory(json.data.messages || []);
          setTotalCount(json.data.totalCount || 0);
        }
      } catch {
        // エラー時は空表示
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [fromAddress, currentMessageId]);

  if (!fromAddress) return null;

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          過去のやり取り
        </h3>
        <p className="text-xs text-slate-400 mt-0.5 truncate">
          {fromName || fromAddress}
        </p>
        {totalCount > 0 && (
          <p className="text-[10px] text-slate-300 mt-0.5">
            {totalCount}件の履歴
          </p>
        )}
      </div>

      {/* 注意書き */}
      <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 shrink-0">
        <p className="text-[10px] text-amber-600">
          最新の受信は反映されていない場合があります
        </p>
      </div>

      {/* 履歴リスト */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-slate-400 animate-pulse">読み込み中...</span>
          </div>
        ) : history.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-slate-400">過去のやり取りはありません</span>
          </div>
        ) : (
          <div className="space-y-0">
            {history.map((msg) => (
              <HistoryItem key={msg.id} message={msg} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryItem({ message }: { message: HistoryMessage }) {
  const [expanded, setExpanded] = useState(false);
  const isSent = message.direction === 'sent';

  return (
    <div
      className={cn(
        'px-4 py-3 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors',
        !message.isRead && !isSent && 'bg-blue-50/30'
      )}
      onClick={() => setExpanded(!expanded)}
    >
      {/* メタ情報 */}
      <div className="flex items-center gap-1.5 mb-1">
        <ChannelBadge channel={message.channel} />
        <span className={cn(
          'text-[10px] px-1.5 py-0.5 rounded',
          isSent
            ? 'bg-blue-50 text-blue-600 border border-blue-100'
            : 'bg-slate-50 text-slate-500 border border-slate-100'
        )}>
          {isSent ? '送信' : '受信'}
        </span>
        <span className="text-[10px] text-slate-400 ml-auto shrink-0">
          {formatRelativeTime(message.timestamp)}
        </span>
      </div>

      {/* 件名 */}
      {message.subject && (
        <p className="text-xs font-medium text-slate-700 truncate mb-0.5">
          {message.subject}
        </p>
      )}

      {/* 本文プレビュー or 展開 */}
      <p className={cn(
        'text-xs text-slate-500 leading-relaxed',
        expanded ? 'whitespace-pre-wrap' : 'line-clamp-2'
      )}>
        {message.body}
      </p>

      {/* 展開インジケーター */}
      {message.body.length > 80 && (
        <button
          className="text-[10px] text-blue-500 hover:underline mt-1"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        >
          {expanded ? '折りたたむ' : '続きを読む'}
        </button>
      )}
    </div>
  );
}
