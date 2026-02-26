'use client';

import { useState } from 'react';
import { ChannelType, UnifiedMessage } from '@/lib/types';
import Button from '@/components/ui/Button';
import Image from 'next/image';
import { CHANNEL_CONFIG } from '@/lib/constants';

interface ComposeMessageProps {
  onClose: () => void;
  onSent?: () => void;
  onSentMessage?: (msg: UnifiedMessage) => void;
}

/**
 * 宛先入力コンポーネント
 */
function RecipientInput({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',' || e.key === 'Tab') && inputValue.trim()) {
      e.preventDefault();
      const trimmed = inputValue.trim().replace(/,$/g, '');
      if (trimmed && !values.includes(trimmed)) {
        onChange([...values, trimmed]);
      }
      setInputValue('');
    }
    if (e.key === 'Backspace' && !inputValue && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  const handleRemove = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };

  return (
    <div className="flex gap-2 items-start">
      <span className="text-slate-400 w-8 shrink-0 pt-1 text-xs">{label}</span>
      <div className="flex-1 flex flex-wrap gap-1 min-h-[28px] items-center">
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="inline-flex items-center gap-0.5 bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs"
          >
            {v}
            <button onClick={() => handleRemove(i)} className="text-slate-400 hover:text-red-500 ml-0.5" type="button">
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            const trimmed = inputValue.trim().replace(/,$/g, '');
            if (trimmed && !values.includes(trimmed)) {
              onChange([...values, trimmed]);
              setInputValue('');
            }
          }}
          placeholder={values.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] text-xs py-0.5 bg-transparent focus:outline-none"
        />
      </div>
    </div>
  );
}

export default function ComposeMessage({ onClose, onSent, onSentMessage }: ComposeMessageProps) {
  const [channel, setChannel] = useState<ChannelType>('email');
  const [toRecipients, setToRecipients] = useState<string[]>([]);
  const [ccRecipients, setCcRecipients] = useState<string[]>([]);
  const [bccRecipients, setBccRecipients] = useState<string[]>([]);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [slackChannel, setSlackChannel] = useState('');
  const [chatworkRoomId, setChatworkRoomId] = useState('');
  const [chatworkTo, setChatworkTo] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const channelOptions: { value: ChannelType; label: string }[] = [
    { value: 'email', label: 'Gmail' },
    { value: 'slack', label: 'Slack' },
    { value: 'chatwork', label: 'Chatwork' },
  ];

  const handleSend = async () => {
    // バリデーション
    if (!body.trim()) {
      setStatusMessage('本文を入力してください。');
      return;
    }
    if (channel === 'email' && toRecipients.length === 0) {
      setStatusMessage('宛先（To）を指定してください。');
      return;
    }
    if (channel === 'slack' && !slackChannel.trim()) {
      setStatusMessage('Slackチャンネルを指定してください。');
      return;
    }
    if (channel === 'chatwork' && !chatworkRoomId.trim()) {
      setStatusMessage('チャットワークルームIDを指定してください。');
      return;
    }

    setIsLoading(true);
    setStatusMessage('');

    const finalBody = channel === 'chatwork' && chatworkTo.length > 0
      ? `${chatworkTo.map((n) => `[To:${n}]`).join('')}\n${body}`
      : body;

    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          body: finalBody,
          to: channel === 'email' ? toRecipients : undefined,
          cc: channel === 'email' ? ccRecipients : undefined,
          bcc: channel === 'email' ? bccRecipients : undefined,
          subject: channel === 'email' ? subject : undefined,
          slackChannel: channel === 'slack' ? slackChannel : undefined,
          chatworkRoomId: channel === 'chatwork' ? chatworkRoomId : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        // 送信メッセージをローカルに追加
        const sentMsg: UnifiedMessage = {
          id: `sent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          channel,
          channelIcon: channel === 'email' ? '📧' : channel === 'slack' ? '💬' : '🔵',
          from: { name: 'あなた', address: 'me' },
          to: channel === 'email' ? toRecipients.map(addr => ({ name: addr, address: addr })) : undefined,
          cc: channel === 'email' && ccRecipients.length > 0 ? ccRecipients.map(addr => ({ name: addr, address: addr })) : undefined,
          subject: channel === 'email' ? subject : undefined,
          body: finalBody,
          timestamp: new Date().toISOString(),
          isRead: true,
          status: 'read',
          direction: 'sent', // Phase 38: 送信メッセージとして記録
          metadata: {
            slackChannel: channel === 'slack' ? slackChannel.replace(/^#/, '') : undefined,
            slackChannelName: channel === 'slack' ? slackChannel.replace(/^#/, '') : undefined,
            chatworkRoomId: channel === 'chatwork' ? chatworkRoomId : undefined,
            chatworkRoomName: channel === 'chatwork' ? `ルーム ${chatworkRoomId}` : undefined,
          },
        };
        onSentMessage?.(sentMsg);

        setStatusMessage('✅ メッセージを送信しました！');
        setTimeout(() => {
          onSent?.();
          onClose();
        }, 1500);
      } else {
        setStatusMessage(`送信失敗: ${data.error || '不明なエラー'}`);
      }
    } catch {
      setStatusMessage('通信エラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">新規メッセージ</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">×</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* チャンネル選択 */}
        <div className="flex gap-1">
          {channelOptions.map((opt) => {
            const config = CHANNEL_CONFIG[opt.value];
            return (
              <button
                key={opt.value}
                onClick={() => setChannel(opt.value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  channel === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Image src={config.icon} alt={opt.label} width={14} height={14} className="shrink-0" />
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* メール宛先 */}
        {channel === 'email' && (
          <div className="space-y-1.5 bg-white border border-slate-200 rounded-lg p-3">
            <RecipientInput label="To:" values={toRecipients} onChange={setToRecipients} placeholder="メールアドレスを入力" />
            <RecipientInput label="Cc:" values={ccRecipients} onChange={setCcRecipients} placeholder="CC（任意）" />
            {showBcc ? (
              <RecipientInput label="Bcc:" values={bccRecipients} onChange={setBccRecipients} placeholder="BCC（任意）" />
            ) : (
              <button onClick={() => setShowBcc(true)} className="text-[10px] text-blue-500 hover:underline ml-8" type="button">
                + BCC を追加
              </button>
            )}
            <div className="flex gap-2 items-center pt-1 border-t border-slate-100 mt-1">
              <span className="text-slate-400 w-8 shrink-0 text-xs">件名:</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="件名を入力"
                className="flex-1 text-xs py-1 bg-transparent focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Slack送信先 */}
        {channel === 'slack' && (
          <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
            <div className="flex gap-2 items-center">
              <span className="text-slate-400 text-xs w-16 shrink-0">チャンネル:</span>
              <input
                type="text"
                value={slackChannel}
                onChange={(e) => setSlackChannel(e.target.value)}
                placeholder="#general、#random など"
                className="flex-1 text-xs py-1 bg-transparent focus:outline-none border-b border-slate-200"
              />
            </div>
            <p className="text-[10px] text-slate-400">
              メンションは本文に @ユーザー名 と入力してください
            </p>
          </div>
        )}

        {/* Chatwork送信先 */}
        {channel === 'chatwork' && (
          <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
            <div className="flex gap-2 items-center">
              <span className="text-slate-400 text-xs w-16 shrink-0">ルームID:</span>
              <input
                type="text"
                value={chatworkRoomId}
                onChange={(e) => setChatworkRoomId(e.target.value)}
                placeholder="123456789"
                className="flex-1 text-xs py-1 bg-transparent focus:outline-none border-b border-slate-200"
              />
            </div>
            <RecipientInput label="宛先:" values={chatworkTo} onChange={setChatworkTo} placeholder="宛先名（任意）" />
          </div>
        )}

        {/* 本文 */}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="メッセージを入力..."
          rows={10}
          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
        />

        {statusMessage && <p className="text-sm text-slate-600">{statusMessage}</p>}
      </div>

      {/* フッター */}
      <div className="p-4 border-t border-slate-200 flex justify-between">
        <Button variant="ghost" size="sm" onClick={onClose}>キャンセル</Button>
        <Button size="sm" onClick={handleSend} disabled={isLoading || !body.trim()}>
          {isLoading ? '送信中...' : '📨 送信'}
        </Button>
      </div>
    </div>
  );
}
