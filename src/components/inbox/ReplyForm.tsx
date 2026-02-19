'use client';

import { useState } from 'react';
import { UnifiedMessage } from '@/lib/types';
import Button from '@/components/ui/Button';

interface ReplyFormProps {
  message: UnifiedMessage;
  onClose: () => void;
}

export default function ReplyForm({ message, onClose }: ReplyFormProps) {
  const [replyText, setReplyText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [showInstruction, setShowInstruction] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

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
