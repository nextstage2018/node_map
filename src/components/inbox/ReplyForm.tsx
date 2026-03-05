'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { UnifiedMessage } from '@/lib/types';
import Button from '@/components/ui/Button';
import { handleKnowledgeResponse } from '@/components/knowledge/KnowledgeToast';

interface ReplyFormProps {
  message: UnifiedMessage;
  onClose: () => void;
  onSentMessage?: (msg: UnifiedMessage) => void;
  autoAiDraft?: boolean;
  draftHint?: string; // AI下書き生成時の追加指示（例: '日程調整の返信を作成'）
  scheduleMode?: boolean; // 日程調整モード（カレンダー空き時間を自動取得）
}

interface SuggestItem {
  address: string;
  name: string;
  channel: string;
  source: 'contact' | 'message_history';
  companyName?: string;
}

/**
 * 宛先入力コンポーネント（タグ形式 + サジェストドロップダウン）
 */
function RecipientInput({
  label,
  values,
  onChange,
  placeholder,
  channelFilter,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  channelFilter?: string;
}) {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<SuggestItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const suggestRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Phase 29: メールアドレスの簡易バリデーション
  const isValidEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };
  const [validationError, setValidationError] = useState('');

  // サジェスト検索
  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    try {
      const params = new URLSearchParams({ q });
      if (channelFilter) params.set('channel', channelFilter);
      const res = await fetch(`/api/contacts/suggest?${params}`);
      const data = await res.json();
      if (data.success && data.data) {
        // 既に追加済みのアドレスを除外
        const filtered = (data.data as SuggestItem[]).filter(
          s => !values.includes(s.address)
        );
        setSuggestions(filtered);
        setShowSuggestions(filtered.length > 0);
        setSelectedIndex(-1);
      }
    } catch {
      setSuggestions([]);
    }
  }, [channelFilter, values]);

  // 入力変更時にデバウンスしてサジェスト検索
  const handleInputChange = (val: string) => {
    setInputValue(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val.trim()), 200);
  };

  // サジェスト選択
  const selectSuggestion = (item: SuggestItem) => {
    if (!values.includes(item.address)) {
      onChange([...values, item.address]);
    }
    setInputValue('');
    setSuggestions([]);
    setShowSuggestions(false);
    setValidationError('');
  };

  // 外部クリックでサジェストを閉じる
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const addAddress = (trimmed: string) => {
    const needsEmailCheck = label.match(/^(To|Cc|Bcc):$/);
    if (trimmed && (!needsEmailCheck || isValidEmail(trimmed))) {
      if (!values.includes(trimmed)) {
        onChange([...values, trimmed]);
        setValidationError('');
      }
    } else if (trimmed && !isValidEmail(trimmed)) {
      setValidationError(`"${trimmed}" は有効なメールアドレスではありません`);
      return;
    }
    setInputValue('');
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // サジェスト表示中のキーボード操作
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, -1));
        return;
      }
      if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[selectedIndex]);
        return;
      }
    }

    if ((e.key === 'Enter' || e.key === ',' || e.key === ' ' || e.key === 'Tab') && inputValue.trim()) {
      e.preventDefault();
      addAddress(inputValue.trim().replace(/,$/g, ''));
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
    <div className="relative" ref={suggestRef}>
      <div className="flex gap-2 items-start">
        <span className="text-slate-400 w-8 shrink-0 pt-1 text-xs">{label}</span>
        <div className="flex-1 flex flex-wrap gap-1 min-h-[28px] items-center">
          {values.map((v, i) => (
            <span
              key={`${v}-${i}`}
              className="inline-flex items-center gap-0.5 bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs"
            >
              {v}
              <button
                onClick={() => handleRemove(i)}
                className="text-slate-400 hover:text-red-500 ml-0.5"
                type="button"
              >
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
            onBlur={() => {
              // 少し遅延してblur（サジェストクリックを拾えるように）
              setTimeout(() => {
                const trimmed = inputValue.trim().replace(/,$/g, '');
                if (trimmed && !showSuggestions) {
                  addAddress(trimmed);
                }
              }, 200);
            }}
            placeholder={values.length === 0 ? placeholder : ''}
            className="flex-1 min-w-[120px] text-xs py-0.5 bg-transparent focus:outline-none"
          />
        </div>
      </div>
      {/* バリデーションエラー表示 */}
      {validationError && (
        <p className="text-[10px] text-red-500 ml-10 mt-0.5">{validationError}</p>
      )}
      {/* サジェストドロップダウン */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute left-8 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
          {suggestions.map((item, idx) => (
            <button
              key={`${item.channel}-${item.address}`}
              type="button"
              className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex items-center gap-2 ${
                idx === selectedIndex ? 'bg-blue-50' : ''
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                selectSuggestion(item);
              }}
            >
              <span className="shrink-0 w-4 text-center">
                {item.source === 'contact' ? '👤' : '📨'}
              </span>
              <span className="flex-1 truncate">
                {item.name && <span className="font-medium text-slate-800">{item.name} </span>}
                <span className="text-slate-500">&lt;{item.address}&gt;</span>
              </span>
              {item.companyName && (
                <span className="text-[10px] text-slate-400 shrink-0">{item.companyName}</span>
              )}
              <span className="text-[10px] text-slate-300 shrink-0">{item.channel}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 返信フォーム
 * メールの場合: To/CC/BCC欄を編集可能
 * Slack: メンション追加可能
 * Chatwork: 宛先指定可能
 */
export default function ReplyForm({ message, onClose, onSentMessage, autoAiDraft = false, draftHint, scheduleMode = false }: ReplyFormProps) {
  const [replyText, setReplyText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [showInstruction, setShowInstruction] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [autoTriggered, setAutoTriggered] = useState(false);

  // メール向け: 全員返信の宛先計算
  const isEmail = message.channel === 'email';
  const isSlack = message.channel === 'slack';
  const isChatwork = message.channel === 'chatwork';

  const { defaultTo, defaultCc } = useMemo(() => {
    if (!isEmail) return { defaultTo: [], defaultCc: [] };

    const isSentMessage = message.direction === 'sent' || message.from.name === 'あなた' || message.from.name === 'Me';

    if (isSentMessage) {
      // 送信済みメッセージへの返信: 元の宛先にTo、CCはそのまま
      const originalTo = message.to?.map((t) => t.address).filter(Boolean) || [];
      const originalCc = message.cc?.map((c) => c.address).filter(Boolean) || [];
      return {
        defaultTo: originalTo,
        defaultCc: Array.from(new Set(originalCc)),
      };
    }

    // 受信メッセージへの返信: 送信者にTo、他の受信者をCCに
    const senderAddress = message.from.address;
    const toAddresses = message.to?.map((t) => t.address).filter(Boolean) || [];
    const ccAddresses = message.cc?.map((c) => c.address).filter(Boolean) || [];
    const replyTo = [senderAddress];
    const allRecipients = [...toAddresses, ...ccAddresses];
    const replyCC = allRecipients.filter(
      (addr) => addr !== senderAddress && !addr.includes('+')
    );
    return {
      defaultTo: replyTo,
      defaultCc: Array.from(new Set(replyCC)),
    };
  }, [isEmail, message]);

  const [toRecipients, setToRecipients] = useState<string[]>(defaultTo);
  const [ccRecipients, setCcRecipients] = useState<string[]>(defaultCc);
  const [bccRecipients, setBccRecipients] = useState<string[]>([]);
  const [showBcc, setShowBcc] = useState(false);

  // Chatwork宛先（account_id形式: [To:12345]のようにAPI宛先指定される）
  const [chatworkTo, setChatworkTo] = useState<string[]>(() => {
    if (!isChatwork) return [];
    // from.address にaccount_idが入っている（数値文字列）
    return message.from.address && message.from.name !== 'あなた' ? [message.from.address] : [];
  });
  // 表示用の名前マッピング（account_id → 名前）
  const chatworkToNames = useMemo(() => {
    const map: Record<string, string> = {};
    if (isChatwork && message.from.address && message.from.name !== 'あなた') {
      map[message.from.address] = message.from.name;
    }
    return map;
  }, [isChatwork, message.from]);

  // 件名（Re: を付与）
  const replySubject = useMemo(() => {
    if (!message.subject) return '';
    return message.subject.startsWith('Re:') ? message.subject : `Re: ${message.subject}`;
  }, [message.subject]);

  // AI下書き生成
  const handleAiDraft = async () => {
    setIsDrafting(true);
    setStatusMessage('');
    try {
      const res = await fetch('/api/ai/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalMessage: message,
          instruction: instruction || draftHint || undefined,
          scheduleMode: scheduleMode || undefined,
        }),
      });
      const data = await res.json();
      if (data.success && data.data?.draft) {
        setReplyText(data.data.draft);
        setStatusMessage('✨ AIが下書きを作成しました。編集して送信してください。');
      } else {
        setStatusMessage('下書きの生成に失敗しました。');
      }
    } catch {
      setStatusMessage('エラーが発生しました。');
    } finally {
      setIsDrafting(false);
    }
  };

  // autoAiDraft: 返信フォーム表示時にAI下書きを自動生成
  useEffect(() => {
    if (autoAiDraft && !autoTriggered && !isDrafting && !replyText) {
      setAutoTriggered(true);
      handleAiDraft();
    }
  }, [autoAiDraft, autoTriggered, isDrafting, replyText]);

  // 返信送信
  const handleSend = async () => {
    if (!replyText.trim()) return;
    setIsLoading(true);
    setStatusMessage('');

    // Chatwork宛先をメッセージ本文に挿入
    let finalBody = replyText;
    if (isChatwork && chatworkTo.length > 0) {
      const toTags = chatworkTo.map((name) => `[To:${name}]`).join('');
      finalBody = `${toTags}\n${replyText}`;
    }

    try {
      const res = await fetch('/api/messages/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: message.id,
          channel: message.channel,
          body: finalBody,
          to: isEmail ? toRecipients : undefined,
          cc: isEmail ? ccRecipients : undefined,
          bcc: isEmail ? bccRecipients : undefined,
          subject: isEmail ? replySubject : undefined,
          metadata: message.metadata,
        }),
      });
      const data = await res.json();
      if (data.success) {
        // Phase 28: ナレッジパイプラインのフィードバック表示
        handleKnowledgeResponse(data, 'message_send');

        // 送信メッセージをローカルに追加（即時表示）
        const sentMsg: UnifiedMessage = {
          id: data.data?.sentReplyId || `sent-reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          channel: message.channel,
          channelIcon: message.channelIcon,
          from: { name: 'あなた', address: 'me' },
          to: isEmail ? toRecipients.map(addr => ({ name: addr, address: addr })) : message.to,
          cc: isEmail && ccRecipients.length > 0 ? ccRecipients.map(addr => ({ name: addr, address: addr })) : undefined,
          subject: isEmail ? replySubject : message.subject,
          body: finalBody,
          timestamp: new Date().toISOString(),
          isRead: true,
          status: 'read',
          direction: 'sent', // Phase 38
          threadId: message.threadId,
          metadata: {
            ...message.metadata,
          },
        };
        onSentMessage?.(sentMsg);

        setStatusMessage('✅ 返信を送信しました！');
        setReplyText('');
        setTimeout(onClose, 1500);
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
    <div className="space-y-3">
      {/* メールの場合: 宛先編集 */}
      {isEmail && (
        <div className="text-xs space-y-1.5 bg-white border border-slate-200 rounded-lg p-3">
          <RecipientInput
            label="To:"
            values={toRecipients}
            onChange={setToRecipients}
            placeholder="メールアドレスを入力（名前で検索可）"
            channelFilter="email"
          />
          <RecipientInput
            label="Cc:"
            values={ccRecipients}
            onChange={setCcRecipients}
            placeholder="CC（任意）"
            channelFilter="email"
          />
          {showBcc ? (
            <RecipientInput
              label="Bcc:"
              values={bccRecipients}
              onChange={setBccRecipients}
              placeholder="BCC（任意）"
              channelFilter="email"
            />
          ) : (
            <button
              onClick={() => setShowBcc(true)}
              className="text-[10px] text-blue-500 hover:underline ml-8"
              type="button"
            >
              + BCC を追加
            </button>
          )}
        </div>
      )}

      {/* Chatwork宛先（account_idベース） */}
      {isChatwork && (
        <div className="text-xs bg-white border border-slate-200 rounded-lg p-3">
          <div className="flex gap-2 items-start">
            <span className="text-slate-400 w-8 shrink-0 pt-1 text-xs">宛先:</span>
            <div className="flex-1 flex flex-wrap gap-1 min-h-[28px] items-center">
              {chatworkTo.map((accountId, i) => (
                <span
                  key={`${accountId}-${i}`}
                  className="inline-flex items-center gap-0.5 bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs"
                >
                  {chatworkToNames[accountId] || accountId}
                  <button
                    onClick={() => setChatworkTo(chatworkTo.filter((_, idx) => idx !== i))}
                    className="text-slate-400 hover:text-red-500 ml-0.5"
                    type="button"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            送信元への宛先指定が自動設定されています
          </p>
        </div>
      )}

      {/* Slack: チャンネル情報表示 */}
      {isSlack && (
        <div className="text-xs bg-white border border-slate-200 rounded-lg p-3">
          <div className="flex gap-2 items-center">
            <span className="text-slate-400">送信先:</span>
            <span className="text-slate-700 font-medium">
              #{message.metadata.slackChannelName || message.metadata.slackChannel}
            </span>
            {message.metadata.slackThreadTs && (
              <span className="text-slate-400">（スレッド返信）</span>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            メンションは本文に @ユーザー名 と入力してください
          </p>
        </div>
      )}

      {/* AI下書きセクション */}
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleAiDraft}
          disabled={isDrafting}
        >
          {isDrafting ? '⏳ 生成中...' : '🤖 AIで下書き'}
        </Button>
        <button
          onClick={() => setShowInstruction(!showInstruction)}
          className="text-xs text-blue-600 hover:underline"
        >
          {showInstruction ? '指示を閉じる' : '+ 指示を追加'}
        </button>
      </div>

      {showInstruction && (
        <input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="例：丁寧に断る、日程を提案する"
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}

      {/* テキストエリア */}
      <textarea
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
        placeholder="返信を入力..."
        rows={6}
        className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
      />

      {/* ステータスメッセージ */}
      {statusMessage && (
        <p className="text-sm text-slate-600">{statusMessage}</p>
      )}

      {/* ボタン */}
      <div className="flex justify-between">
        <Button variant="ghost" size="sm" onClick={onClose}>
          キャンセル
        </Button>
        <Button
          size="sm"
          onClick={handleSend}
          disabled={isLoading || !replyText.trim()}
        >
          {isLoading ? '送信中...' : '📨 送信'}
        </Button>
      </div>
    </div>
  );
}
