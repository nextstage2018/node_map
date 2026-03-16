// v4.0: タスクAI会話ビュー（TaskDetailPanel内で表示）
// v7.1: 画像・PDF・PPTX・DOCX・XLSX添付対応
'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, MessageCircle, ArrowLeft, Paperclip, X, FileText, Image as ImageIcon, ClipboardCheck, ChevronDown, ChevronUp } from 'lucide-react';
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

interface CheckpointResult {
  total_score: number;
  breakdown: {
    goal_clarity: { score: number; comment: string };
    thinking_depth: { score: number; comment: string };
    proactive_vision: { score: number; comment: string };
    risk_awareness: { score: number; comment: string };
    quality_precision: { score: number; comment: string };
  };
  overall_feedback: string;
  improvement_hints: string[];
  can_complete: boolean;
}

interface TaskChatViewProps {
  taskId: string;
  conversations: Conversation[];
  taskStatus: string;
  onBack: () => void;
  onConversationUpdate: () => void;
  onCheckpointScore?: (score: number, canComplete: boolean) => void;
}

interface AttachedFile {
  base64: string;
  mimeType: string;
  name: string;
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

// ファイルタイプ判定
function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}
function isPdfFile(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}
function getFileLabel(name: string, mimeType: string): string {
  if (isImageFile(mimeType)) return `画像: ${name}`;
  if (isPdfFile(mimeType)) return `PDF: ${name}`;
  if (mimeType.includes('presentation')) return `PPTX: ${name}`;
  if (mimeType.includes('wordprocessing')) return `DOCX: ${name}`;
  if (mimeType.includes('spreadsheet')) return `XLSX: ${name}`;
  return `ファイル: ${name}`;
}

const ALLOWED_ACCEPT = 'image/*,.pdf,.pptx,.docx,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export default function TaskChatView({
  taskId,
  conversations,
  taskStatus,
  onBack,
  onConversationUpdate,
  onCheckpointScore,
}: TaskChatViewProps) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [localConversations, setLocalConversations] = useState<Conversation[]>(conversations);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [checkpointResult, setCheckpointResult] = useState<CheckpointResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [showCheckpointDetail, setShowCheckpointDetail] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // propsのconversationsまたはtaskIdが変わったら同期
  useEffect(() => {
    setLocalConversations(conversations);
  }, [conversations, taskId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localConversations]);

  // ファイル添付ハンドラ
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      alert('ファイルは20MB以下にしてください');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      setAttachedFile({ base64, mimeType: file.type, name: file.name });
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = async () => {
    const trimmed = message.trim();
    if ((!trimmed && !attachedFile) || isSending) return;

    const phase = determinePhase(localConversations, taskStatus);

    // 楽観的にユーザーメッセージを追加
    const displayContent = attachedFile
      ? `${trimmed ? trimmed + '\n' : ''}[${getFileLabel(attachedFile.name, attachedFile.mimeType)}]`
      : trimmed;
    const userMsg: Conversation = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: displayContent,
      phase,
      created_at: new Date().toISOString(),
    };
    setLocalConversations(prev => [...prev, userMsg]);

    const defaultMsg = attachedFile ? 'このファイルの内容を確認してください' : '';
    const sendPayload: any = { taskId, message: trimmed || defaultMsg, phase };
    if (attachedFile) {
      sendPayload.file = {
        base64: attachedFile.base64,
        mimeType: attachedFile.mimeType,
        name: attachedFile.name,
      };
    }

    setMessage('');
    setAttachedFile(null);
    setIsSending(true);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const res = await fetch('/api/tasks/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sendPayload),
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

  // 初回AIメッセージ生成
  const handleInitialGreeting = async () => {
    setIsInitialLoading(true);
    try {
      const res = await fetch('/api/tasks/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          message: 'このタスクについて壁打ちを始めたいです。まず何から考えればいいですか？',
          phase: 'ideation',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data?.reply) {
          const userMsg: Conversation = {
            id: `init-user-${Date.now()}`,
            role: 'user',
            content: 'このタスクについて壁打ちを始めたいです。',
            phase: 'ideation',
            created_at: new Date().toISOString(),
          };
          const aiMsg: Conversation = {
            id: `init-ai-${Date.now()}`,
            role: 'assistant',
            content: data.data.reply,
            phase: 'ideation',
            created_at: new Date().toISOString(),
          };
          setLocalConversations([userMsg, aiMsg]);
        }
      }
    } catch (error) {
      console.error('初回AI会話エラー:', error);
    } finally {
      setIsInitialLoading(false);
    }
  };

  // チェックポイント評価
  const handleCheckpoint = async () => {
    if (isEvaluating) return;
    setIsEvaluating(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/checkpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          setCheckpointResult(data.data);
          setShowCheckpointDetail(true);
          onCheckpointScore?.(data.data.total_score, data.data.can_complete);
        }
      }
    } catch (error) {
      console.error('チェックポイント評価エラー:', error);
    } finally {
      setIsEvaluating(false);
    }
  };

  // スコアの色を取得
  const getScoreColor = (score: number, max: number = 100) => {
    const pct = (score / max) * 100;
    if (pct >= 85) return 'text-green-600';
    if (pct >= 60) return 'text-amber-600';
    return 'text-red-500';
  };

  const getScoreBgColor = (score: number, max: number = 100) => {
    const pct = (score / max) * 100;
    if (pct >= 85) return 'bg-green-50 border-green-200';
    if (pct >= 60) return 'bg-amber-50 border-amber-200';
    return 'bg-red-50 border-red-200';
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
        <div className="ml-auto">
          <button
            onClick={handleCheckpoint}
            disabled={isEvaluating || localConversations.length < 2}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors',
              checkpointResult
                ? `${getScoreBgColor(checkpointResult.total_score)} border`
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
              (isEvaluating || localConversations.length < 2) && 'opacity-50 cursor-not-allowed'
            )}
            title={localConversations.length < 2 ? 'AIとの会話が必要です' : 'タスク品質をチェック'}
          >
            {isEvaluating ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <ClipboardCheck className="w-3 h-3" />
            )}
            {checkpointResult ? (
              <span className={getScoreColor(checkpointResult.total_score)}>{checkpointResult.total_score}点</span>
            ) : (
              <span>チェック</span>
            )}
          </button>
        </div>
      </div>

      {/* チェックポイント結果パネル */}
      {checkpointResult && showCheckpointDetail && (
        <div className={cn('shrink-0 border-b mx-4 my-2 rounded-lg p-3 border', getScoreBgColor(checkpointResult.total_score))}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ClipboardCheck className={cn('w-4 h-4', getScoreColor(checkpointResult.total_score))} />
              <span className={cn('text-lg font-bold', getScoreColor(checkpointResult.total_score))}>
                {checkpointResult.total_score}点
              </span>
              <span className="text-[10px] text-slate-500">/ 100</span>
              {checkpointResult.can_complete ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">完了可能</span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">85点以上で完了可能</span>
              )}
            </div>
            <button
              onClick={() => setShowCheckpointDetail(false)}
              className="p-0.5 rounded hover:bg-white/50 transition-colors"
            >
              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>

          {/* 5観点の内訳 */}
          <div className="space-y-1.5 mb-2">
            {[
              { key: 'goal_clarity' as const, label: 'ゴール明確度' },
              { key: 'thinking_depth' as const, label: '思考の深度' },
              { key: 'proactive_vision' as const, label: '先回り・視座' },
              { key: 'risk_awareness' as const, label: 'リスク認識' },
              { key: 'quality_precision' as const, label: '練度・精度' },
            ].map(({ key, label }) => {
              const item = checkpointResult.breakdown[key];
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-600 w-24 shrink-0">{label}</span>
                  <div className="flex-1 h-1.5 bg-white/60 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all',
                        item.score >= 17 ? 'bg-green-500' : item.score >= 12 ? 'bg-amber-500' : 'bg-red-400'
                      )}
                      style={{ width: `${(item.score / 20) * 100}%` }}
                    />
                  </div>
                  <span className={cn('text-[11px] font-medium w-8 text-right', getScoreColor(item.score, 20))}>
                    {item.score}
                  </span>
                  <span className="text-[10px] text-slate-500 flex-1 min-w-0 truncate">{item.comment}</span>
                </div>
              );
            })}
          </div>

          {/* フィードバック */}
          <p className="text-[11px] text-slate-700 leading-relaxed mb-1.5">{checkpointResult.overall_feedback}</p>

          {/* 改善ヒント */}
          {checkpointResult.improvement_hints.length > 0 && (
            <div className="space-y-0.5">
              {checkpointResult.improvement_hints.map((hint, i) => (
                <p key={i} className="text-[10px] text-slate-500">💡 {hint}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 折りたたみ時のスコアバー */}
      {checkpointResult && !showCheckpointDetail && (
        <button
          onClick={() => setShowCheckpointDetail(true)}
          className={cn('shrink-0 mx-4 mt-2 flex items-center gap-2 px-3 py-1.5 rounded-lg border text-left transition-colors hover:opacity-80', getScoreBgColor(checkpointResult.total_score))}
        >
          <ClipboardCheck className={cn('w-3.5 h-3.5', getScoreColor(checkpointResult.total_score))} />
          <span className={cn('text-sm font-bold', getScoreColor(checkpointResult.total_score))}>{checkpointResult.total_score}点</span>
          {checkpointResult.can_complete ? (
            <span className="text-[10px] text-green-600">完了可能</span>
          ) : (
            <span className="text-[10px] text-red-500">85点以上で完了可能</span>
          )}
          <ChevronDown className="w-3 h-3 text-slate-400 ml-auto" />
        </button>
      )}

      {/* メッセージ一覧 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {localConversations.length === 0 && !isSending && !isInitialLoading && (
          <div className="text-center py-8">
            <MessageCircle className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-xs text-slate-400">
              タスクについてAIに相談できます。<br />
              考え方の整理や方向性の壁打ちに活用してください。
            </p>
            <button
              onClick={handleInitialGreeting}
              className="mt-3 px-4 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors"
            >
              AIと壁打ちを始める
            </button>
          </div>
        )}

        {isInitialLoading && localConversations.length === 0 && (
          <div className="flex justify-start mt-4">
            <div className="bg-slate-100 rounded-xl rounded-bl-sm px-3 py-2">
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
            </div>
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
        {/* ファイルプレビュー */}
        {attachedFile && (
          <div className="mb-2 flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
            {isImageFile(attachedFile.mimeType) ? (
              <img
                src={`data:${attachedFile.mimeType};base64,${attachedFile.base64}`}
                alt="添付画像"
                className="w-12 h-12 object-cover rounded"
              />
            ) : (
              <div className="w-12 h-12 flex items-center justify-center bg-slate-200 rounded">
                <FileText className="w-5 h-5 text-slate-500" />
              </div>
            )}
            <span className="text-xs text-slate-500 flex-1 truncate">
              {getFileLabel(attachedFile.name, attachedFile.mimeType)}
            </span>
            <button
              onClick={() => setAttachedFile(null)}
              className="p-1 rounded hover:bg-slate-200 transition-colors"
            >
              <X className="w-3 h-3 text-slate-400" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_ACCEPT}
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending}
            className="p-2 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-slate-50 transition-colors"
            title="ファイルを添付（画像・PDF・PPTX・DOCX・XLSX）"
          >
            <Paperclip className="w-4 h-4" />
          </button>
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
            disabled={(!message.trim() && !attachedFile) || isSending}
            className={cn(
              'p-2 rounded-lg transition-colors',
              (message.trim() || attachedFile) && !isSending
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
