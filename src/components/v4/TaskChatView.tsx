// v4.0: タスクAI会話ビュー（TaskDetailPanel内で表示）
'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, MessageCircle, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Conversation {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  phase: string;
  conversation_tag?: string;
  turn_id?: string;
  created_at: string;
}

interface TaskChatViewProps {
  taskId: string;
  conversations: Conversation[];
  taskStatus: string;
  onBack: () => void;
  onConversationUpdate: () => void;
}

function determinePhase(conversations: Conversation[], taskStatus: string): string {
  if (taskStatus === 'done') return 'result';
  if (conversations.length === 0) return 'ideation';
  return 'progress';
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// シンプルなマークダウン風フォーマット
function formatMessage(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/【(.*?)】/g, '<span class="font-bold text-blue-700">【$1】</span>')
    .replace(/\n/g, '<br/>');
}

export default function TaskChatView({
  taskId,
  conversations,
  taskStatus,
  onBack,
  onConversationUpdate,
}: TaskChatViewProps) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [localConversations, setLocalConversations] = useState<Conversation[]>(conversations);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // propsのconversationsまたはtaskIdが変わったら同期
  useEffect(() => {
    setLocalConversations(conversations);
  }, [conversations, taskId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localConversations]);

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed || isSending) return;

    const phase = determinePhase(localConversations, taskStatus);

    // 楽観的にユーザーメッセージを追加
    const userMsg: Conversation = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: trimmed,
      phase,
      created_at: new Date().toISOString(),
    };
    setLocalConversations(prev => [...prev, userMsg]);
    setMessage('');
    setIsSending(true);
    // テキストエリアの高さをリセット
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const res = await fetch('/api/tasks/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, message: trimmed, phase }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data?.reply) {
          const aiMsg: Conversation = {
            id: `ai-${Date.now()}`,
            role: 'assistant',
            content: data.data.reply,
            phase,
            conversation_tag: data.data.conversationTag,
            created_at: new Date().toISOString(),
          };
          setLocalConversations(prev => [...prev, aiMsg]);
        }
      }
    } catch (error) {
      console.error('AI会話エラー:', error);
    } finally {
      setIsSending(false);
    }
  };

  // テキストエリアの自動高さ調整
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
  };

  const phase = determinePhase(localConversations, taskStatus);
  const phaseLabel = phase === 'ideation' ? '着想' : phase === 'progress' ? '進行' : '結果';

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <button
          onClick={onBack}
          className="p-1 rounded hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-slate-500" />
        </button>
        <MessageCircle className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-medium text-nm-text">AIに相談</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
          {phaseLabel}フェーズ
        </span>
      </div>

      {/* メッセージ一覧 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {localConversations.length === 0 && (
          <div className="text-center py-8">
            <MessageCircle className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-xs text-slate-400">
              タスクについてAIに相談できます。<br />
              考え方の整理や方向性の壁打ちに活用してください。
            </p>
          </div>
        )}

        {localConversations.map((conv) => (
          <div
            key={conv.id}
            className={cn(
              'flex',
              conv.role === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-xl px-3 py-2 text-sm',
                conv.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-slate-100 text-nm-text rounded-bl-sm'
              )}
            >
              <div
                className="leading-relaxed [&_strong]:font-bold"
                dangerouslySetInnerHTML={{ __html: formatMessage(conv.content) }}
              />
              <div className={cn(
                'text-[9px] mt-1',
                conv.role === 'user' ? 'text-blue-200' : 'text-slate-400'
              )}>
                {formatTime(conv.created_at)}
              </div>
            </div>
          </div>
        ))}

        {isSending && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-xl rounded-bl-sm px-3 py-2">
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 入力エリア */}
      <div className="shrink-0 border-t border-slate-100 px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              adjustTextareaHeight();
            }}
            onInput={adjustTextareaHeight}
            placeholder="メッセージを入力..."
            rows={1}
            style={{ maxHeight: '120px' }}
            className="flex-1 resize-none border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
          />
          <button
            onClick={handleSend}
            disabled={!message.trim() || isSending}
            className={cn(
              'p-2 rounded-lg transition-colors',
              message.trim() && !isSending
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-slate-100 text-slate-300'
            )}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
