// Phase A-1: 秘書AIメインチャットコンポーネント
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bot, Send, Loader2, Trash2,
  Inbox, CheckSquare, Zap, GitBranch,
  ClipboardList, Sun, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SecretaryMessage, CardData, CardRenderer } from './ChatCards';

// ========================================
// サジェストチップ定義
// ========================================
interface SuggestChip {
  label: string;
  icon: React.ReactNode;
  message: string;         // チップ押下時に送信する文言
  category: 'inbox' | 'task' | 'job' | 'map' | 'log' | 'general';
}

const SUGGEST_CHIPS: SuggestChip[] = [
  { label: '今日の状況は？', icon: <Sun className="w-3.5 h-3.5" />, message: '今日の状況を教えて', category: 'general' },
  { label: '新着メッセージ', icon: <Inbox className="w-3.5 h-3.5" />, message: '新着メッセージを見せて', category: 'inbox' },
  { label: '対応が必要なこと', icon: <Zap className="w-3.5 h-3.5" />, message: '対応が必要なことは？', category: 'job' },
  { label: 'タスクの状況', icon: <CheckSquare className="w-3.5 h-3.5" />, message: '進行中のタスクを見せて', category: 'task' },
  { label: '思考マップ', icon: <GitBranch className="w-3.5 h-3.5" />, message: '思考マップを見たい', category: 'map' },
  { label: 'ビジネスログ', icon: <ClipboardList className="w-3.5 h-3.5" />, message: '最近のビジネスログを見せて', category: 'log' },
];

// ========================================
// メッセージ用ユニークID生成
// ========================================
function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ========================================
// 秘書AIチャット メインコンポーネント
// ========================================
export default function SecretaryChat() {
  const [messages, setMessages] = useState<SecretaryMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasBriefing, setHasBriefing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // メッセージ末尾にスクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 初回のブリーフィング（アプリ起動時に自動送信）
  useEffect(() => {
    if (!hasBriefing) {
      setHasBriefing(true);
      sendMessage('今日の状況を教えて', true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // メッセージ送信
  const sendMessage = useCallback(async (text: string, isBriefing = false) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    // ユーザーメッセージの追加（ブリーフィングの場合は非表示にしない）
    const userMsg: SecretaryMessage = {
      id: generateId(),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    if (!isBriefing) {
      setMessages((prev) => [...prev, userMsg]);
    }
    setInput('');
    setIsLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      if (!isBriefing) {
        history.push({ role: 'user', content: trimmed });
      }

      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: isBriefing ? [] : history.slice(-15),
        }),
      });

      const data = await res.json();

      if (data.success && data.data) {
        const assistantMsg: SecretaryMessage = {
          id: generateId(),
          role: 'assistant',
          content: data.data.reply || '',
          cards: data.data.cards || undefined,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: 'assistant',
            content: data.error || 'エラーが発生しました。もう一度お試しください。',
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: 'assistant',
          content: '通信エラーが発生しました。接続を確認してください。',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [isLoading, messages]);

  // Enterキーで送信（Shift+Enterで改行）
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // 会話クリア
  const handleClear = () => {
    setMessages([]);
    setHasBriefing(false);
  };

  // カード内アクション（Phase B: 実データ連携）
  const handleCardAction = useCallback(async (action: string, data: unknown) => {
    const d = data as Record<string, unknown>;

    switch (action) {
      case 'select_message': {
        // メッセージ詳細をAPIから取得して会話に追加
        const msgId = d?.id as string;
        if (msgId) {
          sendMessage(`メッセージID: ${msgId} の詳細を見せて`);
        }
        break;
      }
      case 'reply': {
        // 返信下書きの生成を依頼
        const from = (d as Record<string, string>)?.from || '相手';
        sendMessage(`${from}への返信の下書きを作って`);
        break;
      }
      case 'create_job': {
        const subject = (d as Record<string, string>)?.subject || 'このメッセージ';
        sendMessage(`「${subject}」をジョブとして登録して`);
        break;
      }
      case 'create_task': {
        const subject = (d as Record<string, string>)?.subject || 'このメッセージ';
        sendMessage(`「${subject}」をタスクとして登録して`);
        break;
      }
      case 'approve_job': {
        // ジョブ承認 → API呼び出し
        const jobId = d?.id as string;
        if (jobId) {
          try {
            const res = await fetch(`/api/jobs`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: jobId, status: 'done' }),
            });
            const result = await res.json();
            if (result.success) {
              // 承認結果を秘書の返答として追加
              setMessages(prev => [...prev, {
                id: generateId(),
                role: 'assistant',
                content: '',
                cards: [{
                  type: 'action_result',
                  data: { success: true, message: 'ジョブを承認・完了しました', details: d?.title as string },
                }],
                timestamp: new Date().toISOString(),
              }]);
            }
          } catch {
            setMessages(prev => [...prev, {
              id: generateId(),
              role: 'assistant',
              content: 'ジョブの承認中にエラーが発生しました。',
              timestamp: new Date().toISOString(),
            }]);
          }
        }
        break;
      }
      case 'reject_job': {
        setMessages(prev => [...prev, {
          id: generateId(),
          role: 'assistant',
          content: '',
          cards: [{
            type: 'action_result',
            data: { success: true, message: 'ジョブを却下しました', details: d?.title as string },
          }],
          timestamp: new Date().toISOString(),
        }]);
        break;
      }
      case 'edit_job': {
        sendMessage(`ジョブ「${d?.title || ''}」の内容を修正したい`);
        break;
      }
      case 'resume_task': {
        const taskId = (d as Record<string, string>)?.taskId;
        if (taskId) {
          // タスク対話ページへ遷移（将来的には秘書内でタスク対話モードに入る）
          window.location.href = `/tasks?open=${taskId}`;
        }
        break;
      }
      default: {
        sendMessage(`${action}について確認します`);
      }
    }
  }, [sendMessage]);

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-gradient-to-b from-slate-50 to-white">
      {/* ヘッダー */}
      <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900">秘書</h1>
            <p className="text-[10px] text-slate-400">NodeMap パーソナルアシスタント</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            クリア
          </button>
        )}
      </div>

      {/* チャットエリア */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 && !isLoading ? (
          // ウェルカム画面（ブリーフィング読み込み前）
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg mb-4">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <p className="text-lg font-bold text-slate-800 mb-1">おはようございます</p>
            <p className="text-sm text-slate-400 mb-6">今日もよろしくお願いします</p>
            <div className="flex flex-wrap justify-center gap-2 max-w-md">
              {SUGGEST_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => sendMessage(chip.message)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-full hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-all shadow-sm"
                >
                  {chip.icon}
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          // メッセージ一覧
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((msg) => (
              <div key={msg.id}>
                {/* テキストバブル */}
                <div className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                  )}
                  {msg.content && (
                    <div
                      className={cn(
                        'max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm',
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white rounded-br-md'
                          : 'bg-white text-slate-800 border border-slate-200 rounded-bl-md'
                      )}
                    >
                      {msg.content}
                    </div>
                  )}
                </div>
                {/* インラインカード */}
                {msg.cards && msg.cards.length > 0 && (
                  <div className="ml-11 mt-2 space-y-2">
                    {msg.cards.map((card: CardData, idx: number) => (
                      <CardRenderer
                        key={`${msg.id}-card-${idx}`}
                        card={card}
                        onAction={handleCardAction}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* ローディング */}
            {isLoading && (
              <div className="flex justify-start gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-400 text-sm flex items-center gap-2 rounded-bl-md shadow-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>考え中...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* サジェストチップ（会話中） */}
      {messages.length > 0 && !isLoading && (
        <div className="px-4 pb-2 shrink-0">
          <div className="max-w-3xl mx-auto flex flex-wrap gap-1.5">
            {SUGGEST_CHIPS.slice(0, 4).map((chip) => (
              <button
                key={chip.label}
                onClick={() => sendMessage(chip.message)}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-500 bg-white border border-slate-200 rounded-full hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all"
              >
                {chip.icon}
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 入力エリア */}
      <div className="border-t border-slate-200 bg-white px-4 py-3 shrink-0">
        <div className="max-w-3xl mx-auto flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="秘書に話しかける...（Shift+Enterで改行）"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-slate-50"
            style={{ maxHeight: '120px' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 120) + 'px';
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className="shrink-0 w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
