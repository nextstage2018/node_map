'use client';

import { useState, useEffect } from 'react';
import { formatRelativeTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import ChannelBadge from '@/components/ui/ChannelBadge';
import Card from '@/components/ui/Card';
import { Clock, ChevronDown, ChevronUp } from 'lucide-react';
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
 * Phase UI-4: 過去のやり取り変遷パネル
 * Card accent バリアントを活用してデザイン統一。nm-*カスタムカラー適用。
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
      <div className="px-4 py-3 border-b border-nm-border bg-nm-bg shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-3.5 h-3.5 text-nm-text-muted" />
          <h3 className="text-xs font-semibold text-nm-text-secondary uppercase tracking-wider">
            過去のやり取り
          </h3>
        </div>
        <p className="text-xs text-nm-text-muted truncate">
          {fromName || fromAddress}
        </p>
        {totalCount > 0 && (
          <p className="text-[10px] text-nm-text-muted mt-0.5">
            {totalCount}件の履歴
          </p>
        )}
      </div>

      {/* 履歴リスト */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-nm-text-muted animate-pulse">読み込み中...</span>
          </div>
        ) : history.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-nm-text-muted">過去のやり取りはありません</span>
          </div>
        ) : (
          history.map((msg) => (
            <HistoryItem key={msg.id} message={msg} />
          ))
        )}
      </div>
    </div>
  );
}

function HistoryItem({ message }: { message: HistoryMessage }) {
  const [expanded, setExpanded] = useState(false);
  const isSent = message.direction === 'sent';

  return (
    <Card
      variant="accent"
      accent={isSent ? 'blue' : 'slate'}
      padding="sm"
      className="cursor-pointer hover:shadow-nm-md"
      onClick={() => setExpanded(!expanded)}
    >
      {/* メタ情報 */}
      <div className="flex items-center gap-1.5 mb-1">
        <ChannelBadge channel={message.channel} />
        <span className={cn(
          'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
          isSent
            ? 'bg-nm-primary-light text-nm-primary'
            : 'bg-slate-100 text-nm-text-secondary'
        )}>
          {isSent ? '送信' : '受信'}
        </span>
        <span className="text-[10px] text-nm-text-muted ml-auto shrink-0">
          {formatRelativeTime(message.timestamp)}
        </span>
      </div>

      {/* 件名 */}
      {message.subject && (
        <p className="text-xs font-medium text-nm-text truncate mb-0.5">
          {message.subject}
        </p>
      )}

      {/* 本文プレビュー or 展開 */}
      <p className={cn(
        'text-xs text-nm-text-secondary leading-relaxed',
        expanded ? 'whitespace-pre-wrap' : 'line-clamp-2'
      )}>
        {message.body}
      </p>

      {/* 展開インジケーター */}
      {message.body.length > 80 && (
        <button
          className="flex items-center gap-0.5 text-[10px] text-nm-primary hover:underline mt-1"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        >
          {expanded ? (
            <><ChevronUp className="w-3 h-3" />折りたたむ</>
          ) : (
            <><ChevronDown className="w-3 h-3" />続きを読む</>
          )}
        </button>
      )}
    </Card>
  );
}
