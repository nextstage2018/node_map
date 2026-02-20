'use client';

import { useState, useMemo } from 'react';
import { UnifiedMessage } from '@/lib/types';
import Button from '@/components/ui/Button';

interface ReplyFormProps {
  message: UnifiedMessage;
  onClose: () => void;
}

/**
 * 返信フォーム
 * メールの場合: 全員返信をデフォルトにし、To/CC欄を表示
 */
export default function ReplyForm({ message, onClose }: ReplyFormProps) {
  const [replyText, setReplyText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [showInstruction, setShowInstruction] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // メール向け: 全員返信の宛先計算
  const isEmail = message.channel === 'email';
  const { defaultTo, defaultCc, hasMultipleRecipients } = useMemo(() => {
    if (!isEmail) return { defaultTo: [], defaultCc: [], hasMultipleRecipients: false };

    // 自分のアドレスを除外するためのチェック
    // To欄の先頭がだいたい自分（受信者）なので、fromを返信先にする
    const senderAddress = message.from.address;
    const toAddresses = message.to?.map((t) => t.address).filter(Boolean) || [];
    const ccAddresses = message.cc?.map((c) => c.address).filter(Boolean) || [];

    // 返信先: 元の送信者
    const replyTo = [senderAddress];

    // CC: 元のTo（自分を除く） + 元のCC（自分と送信者を除く）
    const allRecipients = [...toAddresses, ...ccAddresses];
    const replyCC = allRecipients.filter(
      (addr) => addr !== senderAddress && !addr.includes('+') // 自分と重複を除外
    );
    // 簡易的に重複除去
    const uniqueCC = Array.from(new Set(replyCC));

    return {
      defaultTo: replyTo,
      defaultCc: uniqueCC,
      hasMultipleRecipients: uniqueCC.length > 0,
    };
  }, [isEmail, message]);

  const [isReplyAll, setIsReplyAll] = useState(true);
  const [toRecipients] = useState<string[]>(defaultTo);
  const [ccRecipients] = useState<string[]>(defaultCc);

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
          instruction: instruction || undefined,
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

  // 返信送信
  const handleSend = async () => {
    if (!replyText.trim()) return;
    setIsLoading(true);
    setStatusMessage('');
    try {
      const res = await fetch('/api/messages/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: message.id,
          channel: message.channel,
          body: replyText,
          to: isEmail ? toRecipients : undefined,
          cc: isEmail && isReplyAll ? ccRecipients : undefined,
          subject: isEmail ? replySubject : undefined,
          metadata: message.metadata,
        }),
      });
      const data = await res.json();
      if (data.success) {
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
      {/* メールの場合: 宛先表示 */}
      {isEmail && (
        <div className="text-xs space-y-1 bg-white border border-slate-200 rounded-lg p-3">
          {/* 全員返信トグル */}
          {hasMultipleRecipients && (
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
              <button
                onClick={() => setIsReplyAll(!isReplyAll)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  isReplyAll
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {isReplyAll ? '👥 全員に返信' : '👤 送信者のみ'}
              </button>
              <span className="text-slate-400">
                {isReplyAll ? 'To + CC全員に送信されます' : '送信者のみに返信します'}
              </span>
            </div>
          )}
          {/* To */}
          <div className="flex gap-2">
            <span className="text-slate-400 w-6 shrink-0">To:</span>
            <div className="flex flex-wrap gap-1">
              {toRecipients.map((addr) => (
                <span
                  key={addr}
                  className="inline-block bg-slate-100 text-slate-700 px-2 py-0.5 rounded"
                >
                  {addr}
                </span>
              ))}
            </div>
          </div>
          {/* CC（全員返信の場合のみ） */}
          {isReplyAll && ccRecipients.length > 0 && (
            <div className="flex gap-2">
              <span className="text-slate-400 w-6 shrink-0">Cc:</span>
              <div className="flex flex-wrap gap-1">
                {ccRecipients.map((addr) => (
                  <span
                    key={addr}
                    className="inline-block bg-slate-50 text-slate-500 px-2 py-0.5 rounded"
                  >
                    {addr}
                  </span>
                ))}
              </div>
            </div>
          )}
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
          {isLoading ? '送信中...' : isEmail && isReplyAll && hasMultipleRecipients ? '📨 全員に送信' : '📨 送信'}
        </Button>
      </div>
    </div>
  );
}
