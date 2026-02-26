'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChannelType, UnifiedMessage } from '@/lib/types';
import Button from '@/components/ui/Button';
import Image from 'next/image';
import { CHANNEL_CONFIG } from '@/lib/constants';

interface ComposeMessageProps {
  onClose: () => void;
  onSent?: () => void;
  onSentMessage?: (msg: UnifiedMessage) => void;
}

// 宛先候補の型
interface Recipient {
  type: 'contact' | 'slack_channel' | 'chatwork_room';
  id: string;
  name: string;
  subLabel?: string;
  address?: string;
  channel: string;
}

/**
 * 宛先サジェスト付き入力コンポーネント
 */
function RecipientInputWithSuggest({
  label,
  values,
  displayValues,
  onChange,
  placeholder,
  channelFilter,
  onSelectRecipient,
}: {
  label: string;
  values: string[];
  displayValues?: Record<string, string>; // address → 表示名マッピング
  onChange: (v: string[]) => void;
  placeholder?: string;
  channelFilter?: string;
  onSelectRecipient?: (r: Recipient) => void;
}) {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<Recipient[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 宛先候補を検索
  const searchRecipients = useCallback(async (query: string) => {
    if (query.length < 1) {
      setSuggestions([]);
      return;
    }
    try {
      const channelParam = channelFilter ? `&channel=${channelFilter}` : '';
      const res = await fetch(`/api/messages/recipients?q=${encodeURIComponent(query)}${channelParam}`);
      const data = await res.json();
      if (data.success) {
        // 既に追加済みのアドレスを除外
        const filtered = (data.data as Recipient[]).filter(
          (r) => !values.includes(r.address || r.name)
        );
        setSuggestions(filtered.slice(0, 8));
        setShowSuggestions(filtered.length > 0);
        setSelectedIndex(-1);
      }
    } catch {
      setSuggestions([]);
    }
  }, [channelFilter, values]);

  // デバウンス付き検索
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (inputValue.trim()) {
      debounceRef.current = setTimeout(() => searchRecipients(inputValue.trim()), 300);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [inputValue, searchRecipients]);

  // 外部クリックでサジェストを閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectSuggestion = (r: Recipient) => {
    const value = r.address || r.name;
    if (!values.includes(value)) {
      onChange([...values, value]);
    }
    onSelectRecipient?.(r);
    setInputValue('');
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, -1));
        return;
      }
      if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[selectedIndex]);
        return;
      }
    }
    if ((e.key === 'Enter' || e.key === ',' || e.key === 'Tab') && inputValue.trim()) {
      e.preventDefault();
      const trimmed = inputValue.trim().replace(/,$/g, '');
      if (trimmed && !values.includes(trimmed)) {
        onChange([...values, trimmed]);
      }
      setInputValue('');
      setShowSuggestions(false);
    }
    if (e.key === 'Backspace' && !inputValue && values.length > 0) {
      onChange(values.slice(0, -1));
    }
    if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleRemove = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="flex gap-2 items-start">
        <span className="text-slate-400 w-8 shrink-0 pt-1 text-xs">{label}</span>
        <div className="flex-1 flex flex-wrap gap-1 min-h-[28px] items-center">
          {values.map((v, i) => (
            <span
              key={`${v}-${i}`}
              className="inline-flex items-center gap-0.5 bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs"
            >
              {displayValues?.[v] || v}
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
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
            onBlur={() => {
              // 少し遅延してblur処理（サジェストクリック用）
              setTimeout(() => {
                const trimmed = inputValue.trim().replace(/,$/g, '');
                if (trimmed && !values.includes(trimmed) && !showSuggestions) {
                  onChange([...values, trimmed]);
                  setInputValue('');
                }
              }, 200);
            }}
            placeholder={values.length === 0 ? placeholder : '名前で検索...'}
            className="flex-1 min-w-[120px] text-xs py-0.5 bg-transparent focus:outline-none"
          />
        </div>
      </div>

      {/* サジェストドロップダウン */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute left-8 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
          {suggestions.map((r, i) => (
            <button
              key={r.id + (r.address || '')}
              type="button"
              className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors flex items-center gap-2 ${
                i === selectedIndex ? 'bg-blue-50' : ''
              }`}
              onMouseDown={(e) => { e.preventDefault(); selectSuggestion(r); }}
            >
              <span className="w-4 text-center">
                {r.type === 'contact' ? '👤' : r.type === 'slack_channel' ? '💬' : '🔵'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-800 truncate">{r.name}</div>
                {r.subLabel && (
                  <div className="text-[10px] text-slate-400 truncate">{r.subLabel}</div>
                )}
              </div>
              <span className="text-[10px] text-slate-300 shrink-0">
                {r.channel === 'email' ? 'Email' : r.channel === 'slack' ? 'Slack' : 'CW'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * チャネル宛先サジェスト（Slack/Chatwork用）
 */
function ChannelSuggestInput({
  label,
  value,
  displayValue,
  onChange,
  onSelect,
  placeholder,
  channelFilter,
}: {
  label: string;
  value: string;
  displayValue?: string;
  onChange: (v: string) => void;
  onSelect?: (r: Recipient) => void;
  placeholder?: string;
  channelFilter: string;
}) {
  const [inputValue, setInputValue] = useState(displayValue || value);
  const [suggestions, setSuggestions] = useState<Recipient[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 初回: 空クエリでチャネル一覧を取得
  const loadInitialSuggestions = useCallback(async () => {
    try {
      const res = await fetch(`/api/messages/recipients?q=&channel=${channelFilter}`);
      const data = await res.json();
      if (data.success) {
        const filtered = (data.data as Recipient[]).filter(
          (r) => r.type === 'slack_channel' || r.type === 'chatwork_room'
        );
        setSuggestions(filtered.slice(0, 10));
        setShowSuggestions(filtered.length > 0);
      }
    } catch { /* ignore */ }
  }, [channelFilter]);

  const searchChannels = useCallback(async (query: string) => {
    try {
      const res = await fetch(`/api/messages/recipients?q=${encodeURIComponent(query)}&channel=${channelFilter}`);
      const data = await res.json();
      if (data.success) {
        const filtered = (data.data as Recipient[]).filter(
          (r) => r.type === 'slack_channel' || r.type === 'chatwork_room'
        );
        setSuggestions(filtered.slice(0, 10));
        setShowSuggestions(filtered.length > 0);
        setSelectedIndex(-1);
      }
    } catch {
      setSuggestions([]);
    }
  }, [channelFilter]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchChannels(inputValue.trim()), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [inputValue, searchChannels]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectSuggestion = (r: Recipient) => {
    onChange(r.address || '');
    setInputValue(r.name);
    onSelect?.(r);
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, -1));
        return;
      }
      if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[selectedIndex]);
        return;
      }
    }
    if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="flex gap-2 items-center">
        <span className="text-slate-400 text-xs w-16 shrink-0">{label}</span>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); onChange(e.target.value); }}
          onKeyDown={handleKeyDown}
          onFocus={loadInitialSuggestions}
          placeholder={placeholder}
          className="flex-1 text-xs py-1 bg-transparent focus:outline-none border-b border-slate-200"
        />
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute left-16 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
          {suggestions.map((r, i) => (
            <button
              key={r.id}
              type="button"
              className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors ${
                i === selectedIndex ? 'bg-blue-50' : ''
              }`}
              onMouseDown={(e) => { e.preventDefault(); selectSuggestion(r); }}
            >
              <div className="font-medium text-slate-800">{r.name}</div>
              {r.subLabel && <div className="text-[10px] text-slate-400">{r.subLabel}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ComposeMessage({ onClose, onSent, onSentMessage }: ComposeMessageProps) {
  const [channel, setChannel] = useState<ChannelType>('email');
  const [toRecipients, setToRecipients] = useState<string[]>([]);
  const [toDisplayNames, setToDisplayNames] = useState<Record<string, string>>({});
  const [ccRecipients, setCcRecipients] = useState<string[]>([]);
  const [bccRecipients, setBccRecipients] = useState<string[]>([]);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [slackChannel, setSlackChannel] = useState('');
  const [slackChannelName, setSlackChannelName] = useState('');
  const [chatworkRoomId, setChatworkRoomId] = useState('');
  const [chatworkRoomName, setChatworkRoomName] = useState('');
  const [chatworkTo, setChatworkTo] = useState<string[]>([]);
  const [chatworkToNames, setChatworkToNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const channelOptions: { value: ChannelType; label: string }[] = [
    { value: 'email', label: 'Gmail' },
    { value: 'slack', label: 'Slack' },
    { value: 'chatwork', label: 'Chatwork' },
  ];

  const handleSend = async () => {
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
      setStatusMessage('チャットワークルームを指定してください。');
      return;
    }

    setIsLoading(true);
    setStatusMessage('');

    const finalBody = channel === 'chatwork' && chatworkTo.length > 0
      ? `${chatworkTo.map((id) => `[To:${id}]`).join('')}\n${body}`
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
        const sentMsg: UnifiedMessage = {
          id: `sent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          channel,
          channelIcon: channel === 'email' ? '📧' : channel === 'slack' ? '💬' : '🔵',
          from: { name: 'あなた', address: 'me' },
          to: channel === 'email' ? toRecipients.map(addr => ({ name: toDisplayNames[addr] || addr, address: addr })) : undefined,
          cc: channel === 'email' && ccRecipients.length > 0 ? ccRecipients.map(addr => ({ name: addr, address: addr })) : undefined,
          subject: channel === 'email' ? subject : undefined,
          body: finalBody,
          timestamp: new Date().toISOString(),
          isRead: true,
          status: 'read',
          direction: 'sent',
          metadata: {
            slackChannel: channel === 'slack' ? slackChannel : undefined,
            slackChannelName: channel === 'slack' ? (slackChannelName || slackChannel) : undefined,
            chatworkRoomId: channel === 'chatwork' ? chatworkRoomId : undefined,
            chatworkRoomName: channel === 'chatwork' ? (chatworkRoomName || `ルーム ${chatworkRoomId}`) : undefined,
          },
        };
        onSentMessage?.(sentMsg);
        setStatusMessage('✅ メッセージを送信しました！');
        setTimeout(() => { onSent?.(); onClose(); }, 1500);
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

        {/* メール宛先（サジェスト付き） */}
        {channel === 'email' && (
          <div className="space-y-1.5 bg-white border border-slate-200 rounded-lg p-3">
            <RecipientInputWithSuggest
              label="To:"
              values={toRecipients}
              displayValues={toDisplayNames}
              onChange={setToRecipients}
              placeholder="名前またはメールアドレスで検索..."
              channelFilter="email"
              onSelectRecipient={(r) => {
                if (r.address && r.name) {
                  setToDisplayNames((prev) => ({ ...prev, [r.address!]: `${r.name} <${r.address}>` }));
                }
              }}
            />
            <RecipientInputWithSuggest
              label="Cc:"
              values={ccRecipients}
              onChange={setCcRecipients}
              placeholder="CC（任意）"
              channelFilter="email"
            />
            {showBcc ? (
              <RecipientInputWithSuggest
                label="Bcc:"
                values={bccRecipients}
                onChange={setBccRecipients}
                placeholder="BCC（任意）"
                channelFilter="email"
              />
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

        {/* Slack送信先（サジェスト付き） */}
        {channel === 'slack' && (
          <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
            <ChannelSuggestInput
              label="チャンネル:"
              value={slackChannel}
              displayValue={slackChannelName}
              onChange={(v) => { setSlackChannel(v); setSlackChannelName(''); }}
              onSelect={(r) => { setSlackChannel(r.address || ''); setSlackChannelName(r.name); }}
              placeholder="チャンネル名で検索..."
              channelFilter="slack"
            />
            <p className="text-[10px] text-slate-400">
              メンションは本文に @ユーザー名 と入力してください
            </p>
          </div>
        )}

        {/* Chatwork送信先（サジェスト付き） */}
        {channel === 'chatwork' && (
          <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
            <ChannelSuggestInput
              label="ルーム:"
              value={chatworkRoomId}
              displayValue={chatworkRoomName}
              onChange={(v) => { setChatworkRoomId(v); setChatworkRoomName(''); }}
              onSelect={(r) => { setChatworkRoomId(r.address || ''); setChatworkRoomName(r.name); }}
              placeholder="ルーム名で検索..."
              channelFilter="chatwork"
            />
            <RecipientInputWithSuggest
              label="宛先:"
              values={chatworkTo}
              displayValues={chatworkToNames}
              onChange={setChatworkTo}
              placeholder="宛先を名前で検索..."
              channelFilter="chatwork"
              onSelectRecipient={(r) => {
                if (r.type === 'contact' && r.address && r.name) {
                  setChatworkToNames((prev) => ({ ...prev, [r.address!]: r.name }));
                }
              }}
            />
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
