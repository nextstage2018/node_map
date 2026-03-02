// Phase A-1: 秘書AIメインチャットコンポーネント
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bot, Send, Loader2, Trash2,
  Inbox, CheckSquare, Zap, GitBranch,
  ClipboardList, Sun, Sparkles, Calendar, FolderInput,
  Paperclip, Upload, X, FileText, ChevronDown,
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
  { label: '今日やること', icon: <Sun className="w-3.5 h-3.5" />, message: '今日の状況を教えて', category: 'general' },
  { label: 'プロジェクトを確認', icon: <ClipboardList className="w-3.5 h-3.5" />, message: 'プロジェクト一覧を見せて', category: 'log' },
  { label: 'タスクを進める', icon: <CheckSquare className="w-3.5 h-3.5" />, message: '進行中のタスクを見せて', category: 'task' },
  { label: '新着メッセージ', icon: <Inbox className="w-3.5 h-3.5" />, message: '新着メッセージを見せて', category: 'inbox' },
  { label: '対応が必要なこと', icon: <Zap className="w-3.5 h-3.5" />, message: '対応が必要なことは？', category: 'job' },
  { label: '今日の予定', icon: <Calendar className="w-3.5 h-3.5" />, message: '今日の予定を教えて', category: 'general' },
  { label: '空き時間を探す', icon: <Calendar className="w-3.5 h-3.5" />, message: '今週の空き時間を教えて', category: 'general' },
  { label: '届いたファイル確認', icon: <FolderInput className="w-3.5 h-3.5" />, message: '届いたファイルを確認したい', category: 'general' },
  { label: '活動要約', icon: <ClipboardList className="w-3.5 h-3.5" />, message: '今週の活動要約を見せて', category: 'log' },
  { label: '思考マップ', icon: <GitBranch className="w-3.5 h-3.5" />, message: '思考マップを見たい', category: 'map' },
  { label: 'ナレッジ提案', icon: <Sparkles className="w-3.5 h-3.5" />, message: 'ナレッジの構造化提案を見せて', category: 'general' },
];

// ========================================
// メッセージ用ユニークID生成
// ========================================
function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ========================================
// 書類種別の定数
// ========================================
const DOCUMENT_TYPES = [
  '提案書', '見積書', '契約書', '請求書', '発注書',
  '納品書', '仕様書', '議事録', '報告書', '企画書', 'その他',
];

// ========================================
// ファイルアップロードパネル
// ========================================
interface UploadProject {
  id: string;
  name: string;
  organizationId: string | null;
  organizationName: string | null;
}

interface FileUploadPanelProps {
  onClose: () => void;
  onUploadComplete: (result: { fileName: string; driveUrl: string; projectName: string; documentType: string }) => void;
}

function FileUploadPanel({ onClose, onUploadComplete }: FileUploadPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [projects, setProjects] = useState<UploadProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [documentType, setDocumentType] = useState('その他');
  const [direction, setDirection] = useState<'submitted' | 'received'>('submitted');
  const [memo, setMemo] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // プロジェクト一覧取得
  useEffect(() => {
    fetch('/api/drive/upload')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data?.projects) {
          setProjects(data.data.projects);
        }
      })
      .catch(() => {});
  }, []);

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  };

  const handleUpload = async () => {
    if (!file || !selectedProjectId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', selectedProjectId);
      formData.append('documentType', documentType);
      formData.append('direction', direction);
      formData.append('memo', memo);

      const res = await fetch('/api/drive/upload', {
        method: 'POST',
        body: formData,
      });
      const result = await res.json();
      if (result.success) {
        onUploadComplete({
          fileName: result.data.fileName,
          driveUrl: result.data.driveUrl,
          projectName: result.data.projectName,
          documentType: result.data.documentType,
        });
        onClose();
      } else {
        alert(result.error || 'アップロードに失敗しました');
      }
    } catch {
      alert('アップロード中にエラーが発生しました');
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg mx-4 mb-3 overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-slate-700">ファイルをアップロード</span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* ドラッグ&ドロップ / ファイル選択 */}
        {!file ? (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
              dragOver
                ? 'border-blue-400 bg-blue-50'
                : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50/50'
            )}
          >
            <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
            <p className="text-sm text-slate-600">ファイルをドラッグ&ドロップ</p>
            <p className="text-xs text-slate-400 mt-1">またはクリックして選択</p>
          </div>
        ) : (
          <div className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
            <FileText className="w-8 h-8 text-blue-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
              <p className="text-xs text-slate-400">{formatFileSize(file.size)}</p>
            </div>
            <button
              onClick={() => setFile(null)}
              className="text-slate-400 hover:text-red-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileSelect(f);
          }}
        />

        {/* プロジェクト選択 */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">プロジェクト</label>
          <div className="relative">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white appearance-none pr-8"
            >
              <option value="">プロジェクトを選択</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.organizationName ? `${p.organizationName} / ${p.name}` : p.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* 書類種別 + 方向 */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-500 mb-1">書類種別</label>
            <div className="relative">
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white appearance-none pr-8"
              >
                {DOCUMENT_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
          <div className="w-28">
            <label className="block text-xs font-medium text-slate-500 mb-1">方向</label>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button
                onClick={() => setDirection('submitted')}
                className={cn(
                  'flex-1 py-2 text-xs font-medium transition-colors',
                  direction === 'submitted'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50'
                )}
              >
                提出
              </button>
              <button
                onClick={() => setDirection('received')}
                className={cn(
                  'flex-1 py-2 text-xs font-medium transition-colors',
                  direction === 'received'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50'
                )}
              >
                受領
              </button>
            </div>
          </div>
        </div>

        {/* メモ */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">メモ（任意）</label>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="例: A社向け初回提案"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* アップロードボタン */}
        <button
          onClick={handleUpload}
          disabled={!file || !selectedProjectId || uploading}
          className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              アップロード中...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Google Driveにアップロード
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ========================================
// テキスト内のURLをクリック可能なリンクに変換
// Markdown形式 [text](url) と 生URL の両方に対応
// ========================================
function linkifyText(text: string, isUser: boolean): React.ReactNode {
  // Markdown形式のリンク [text](url) と 生URL を同時に検出
  const combinedRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(https?:\/\/[^\s)]+)/g;
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  const linkClass = isUser ? 'underline text-blue-100 hover:text-white' : 'underline text-blue-600 hover:text-blue-800';

  while ((match = combinedRegex.exec(text)) !== null) {
    // マッチ前のテキストを追加
    if (match.index > lastIndex) {
      result.push(text.slice(lastIndex, match.index));
    }

    if (match[1] && match[2]) {
      // Markdown形式: [text](url)
      result.push(
        <a key={match.index} href={match[2]} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {match[1]}
        </a>
      );
    } else if (match[3]) {
      // 生URL: 末尾の記号を除去
      const cleaned = match[3].replace(/[。、）」』\])]+$/, '');
      const trailing = match[3].slice(cleaned.length);
      result.push(
        <span key={match.index}>
          <a href={cleaned} target="_blank" rel="noopener noreferrer" className={linkClass}>
            {cleaned}
          </a>
          {trailing}
        </span>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // 残りのテキスト
  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }

  return result.length > 0 ? result : text;
}

// ========================================
// 秘書AIチャット メインコンポーネント
// ========================================
export default function SecretaryChat() {
  const [messages, setMessages] = useState<SecretaryMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasBriefing, setHasBriefing] = useState(false);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
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

  // Enterキーは改行のみ（送信はボタンで行う）
  // IME変換確定のEnterで誤送信されるのを防ぐため、Enterでの送信を無効化

  // 会話クリア
  const handleClear = () => {
    setMessages([]);
    setHasBriefing(false);
  };

  // ファイルアップロード完了
  const handleUploadComplete = useCallback((result: { fileName: string; driveUrl: string; projectName: string; documentType: string }) => {
    setMessages(prev => [...prev, {
      id: generateId(),
      role: 'assistant',
      content: `ファイルをアップロードしました。\n\n${result.documentType}: ${result.fileName}\nプロジェクト: ${result.projectName}\nDrive: ${result.driveUrl}`,
      cards: [{
        type: 'action_result',
        data: {
          success: true,
          message: `${result.documentType}をアップロードしました`,
          details: `${result.projectName} - ${result.fileName}`,
        },
      }],
      timestamp: new Date().toISOString(),
    }]);
  }, []);

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
        // Phase B拡張: ジョブ承認 → 実行API呼び出し
        const jobId = d?.id as string;
        if (jobId) {
          try {
            // 実行APIを呼び出し（修正済みの下書きがあれば送る）
            const res = await fetch(`/api/jobs/${jobId}/execute`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                editedDraft: d?.editedDraft || undefined,
              }),
            });
            const result = await res.json();
            if (result.success) {
              setMessages(prev => [...prev, {
                id: generateId(),
                role: 'assistant',
                content: '',
                cards: [{
                  type: 'action_result',
                  data: {
                    success: true,
                    message: result.data?.message || 'ジョブを実行完了しました',
                    details: `${d?.targetName || ''}${d?.channel ? ` (${d.channel})` : ''}`,
                  },
                }],
                timestamp: new Date().toISOString(),
              }]);
            } else {
              // 実行失敗
              setMessages(prev => [...prev, {
                id: generateId(),
                role: 'assistant',
                content: '',
                cards: [{
                  type: 'action_result',
                  data: {
                    success: false,
                    message: 'ジョブの実行に失敗しました',
                    details: result.error || '再試行してください',
                  },
                }],
                timestamp: new Date().toISOString(),
              }]);
            }
          } catch {
            setMessages(prev => [...prev, {
              id: generateId(),
              role: 'assistant',
              content: 'ジョブの実行中にエラーが発生しました。',
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
      case 'send_reply': {
        // Phase C: 返信送信 → /api/messages/reply を呼び出し
        try {
          const replyData = d as Record<string, unknown>;
          const res = await fetch('/api/messages/reply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messageId: replyData.originalMessageId,
              channel: replyData.channel,
              to: replyData.to,
              subject: replyData.subject,
              body: replyData.draft,
              metadata: replyData.metadata,
            }),
          });
          const result = await res.json();
          setMessages(prev => [...prev, {
            id: generateId(),
            role: 'assistant',
            content: '',
            cards: [{
              type: 'action_result',
              data: result.success
                ? { success: true, message: `${(replyData.toName as string) || '相手'}に返信を送信しました`, details: `チャネル: ${replyData.channel}` }
                : { success: false, message: '返信の送信に失敗しました', details: result.error || '' },
            }],
            timestamp: new Date().toISOString(),
          }]);
        } catch {
          setMessages(prev => [...prev, {
            id: generateId(),
            role: 'assistant',
            content: '返信の送信中にエラーが発生しました。',
            timestamp: new Date().toISOString(),
          }]);
        }
        break;
      }
      case 'reject_reply': {
        setMessages(prev => [...prev, {
          id: generateId(),
          role: 'assistant',
          content: '返信を却下しました。別の対応が必要ですか？',
          timestamp: new Date().toISOString(),
        }]);
        break;
      }
      case 'click_deadline': {
        const itemType = d?.type as string;
        const itemId = d?.id as string;
        if (itemType === 'task' && itemId) {
          window.location.href = `/tasks?open=${itemId}`;
        } else if (itemType === 'job' && itemId) {
          window.location.href = `/jobs`;
        }
        break;
      }
      case 'approve_file': {
        // Phase 44c: ファイル承認 → approve API呼び出し
        const fileId = d?.fileId as string;
        if (fileId) {
          try {
            const res = await fetch(`/api/drive/files/intake/${fileId}/approve`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                documentType: d?.documentType || 'その他',
                direction: d?.direction || 'received',
                yearMonth: d?.yearMonth || new Date().toISOString().slice(0, 7),
              }),
            });
            const result = await res.json();
            setMessages(prev => [...prev, {
              id: generateId(),
              role: 'assistant',
              content: '',
              cards: [{
                type: 'action_result',
                data: result.success
                  ? { success: true, message: 'ファイルを承認しました', details: result.data?.driveUrl ? `Drive: ${result.data.driveUrl}` : '' }
                  : { success: false, message: 'ファイルの承認に失敗しました', details: result.error || '' },
              }],
              timestamp: new Date().toISOString(),
            }]);
          } catch {
            setMessages(prev => [...prev, {
              id: generateId(),
              role: 'assistant',
              content: 'ファイルの承認中にエラーが発生しました。',
              timestamp: new Date().toISOString(),
            }]);
          }
        }
        break;
      }
      case 'reject_file': {
        const fileId = d?.fileId as string;
        if (fileId) {
          try {
            await fetch(`/api/drive/files/intake/${fileId}/reject`, {
              method: 'POST',
            });
            setMessages(prev => [...prev, {
              id: generateId(),
              role: 'assistant',
              content: '',
              cards: [{
                type: 'action_result',
                data: { success: true, message: 'ファイルを却下しました' },
              }],
              timestamp: new Date().toISOString(),
            }]);
          } catch {
            setMessages(prev => [...prev, {
              id: generateId(),
              role: 'assistant',
              content: 'ファイルの却下中にエラーが発生しました。',
              timestamp: new Date().toISOString(),
            }]);
          }
        }
        break;
      }
      case 'approve_all_files': {
        try {
          const res = await fetch('/api/drive/files/intake/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          const result = await res.json();
          setMessages(prev => [...prev, {
            id: generateId(),
            role: 'assistant',
            content: '',
            cards: [{
              type: 'action_result',
              data: result.success
                ? { success: true, message: result.data?.message || '一括承認が完了しました', details: `承認: ${result.data?.approved || 0}件` }
                : { success: false, message: '一括承認に失敗しました', details: result.error || '' },
            }],
            timestamp: new Date().toISOString(),
          }]);
        } catch {
          setMessages(prev => [...prev, {
            id: generateId(),
            role: 'assistant',
            content: '一括承認中にエラーが発生しました。',
            timestamp: new Date().toISOString(),
          }]);
        }
        break;
      }
      case 'confirm_storage': {
        try {
          const storeData = data as Record<string, unknown>;
          const urls = (storeData.urls as Array<{ url: string }>) || [];
          let successCount = 0;
          for (const urlItem of urls) {
            const res = await fetch('/api/drive/store-file', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fileUrl: urlItem.url,
                organizationId: storeData.organizationId,
                projectId: storeData.projectId,
                documentType: storeData.documentType,
                direction: storeData.direction,
                yearMonth: storeData.yearMonth,
              }),
            });
            const result = await res.json();
            if (result.success) successCount++;
          }
          setMessages(prev => [...prev, {
            id: generateId(),
            role: 'assistant',
            content: '',
            cards: [{
              type: 'action_result',
              data: successCount > 0
                ? { success: true, message: `${successCount}件のファイルを格納しました` }
                : { success: false, message: '格納に失敗しました' },
            }],
            timestamp: new Date().toISOString(),
          }]);
        } catch {
          setMessages(prev => [...prev, {
            id: generateId(),
            role: 'assistant',
            content: 'ファイル格納中にエラーが発生しました。',
            timestamp: new Date().toISOString(),
          }]);
        }
        break;
      }
      case 'create_business_event': {
        const eventData = data as Record<string, unknown>;
        try {
          const res = await fetch('/api/business-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: eventData.title,
              content: eventData.content || null,
              eventType: eventData.eventType || 'note',
              projectId: eventData.projectId || null,
            }),
          });
          const result = await res.json();
          setMessages(prev => [...prev, {
            id: generateId(),
            role: 'assistant',
            content: '',
            cards: [{
              type: 'action_result',
              data: result.success
                ? { success: true, message: 'ビジネスイベントを登録しました', details: eventData.title as string }
                : { success: false, message: 'イベント登録に失敗しました', details: result.error || '' },
            }],
            timestamp: new Date().toISOString(),
          }]);
        } catch {
          setMessages(prev => [...prev, {
            id: generateId(),
            role: 'assistant',
            content: 'イベント登録中にエラーが発生しました。',
            timestamp: new Date().toISOString(),
          }]);
        }
        break;
      }
      case 'cancel_event_creation': {
        setMessages(prev => [...prev, {
          id: generateId(),
          role: 'assistant',
          content: 'イベント登録をキャンセルしました。',
          timestamp: new Date().toISOString(),
        }]);
        break;
      }
      case 'approve_knowledge_proposal': {
        const proposalId = d?.proposalId as string;
        if (proposalId) {
          try {
            const res = await fetch(`/api/knowledge/proposals/${proposalId}/apply`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            });
            const result = await res.json();
            if (result.success) {
              setMessages(prev => [...prev, {
                id: generateId(),
                role: 'assistant',
                content: `ナレッジ構造を確定しました。${result.message || ''}`,
                cards: [{ type: 'action_result', data: { success: true, message: result.message || 'ナレッジ構造が更新されました' } }],
                timestamp: new Date().toISOString(),
              }]);
            } else {
              setMessages(prev => [...prev, {
                id: generateId(),
                role: 'assistant',
                content: `提案の適用に失敗しました: ${result.error}`,
                cards: [{ type: 'action_result', data: { success: false, message: result.error } }],
                timestamp: new Date().toISOString(),
              }]);
            }
          } catch (err) {
            setMessages(prev => [...prev, {
              id: generateId(),
              role: 'assistant',
              content: 'ナレッジ提案の適用中にエラーが発生しました。',
              cards: [{ type: 'action_result', data: { success: false, message: 'ネットワークエラー' } }],
              timestamp: new Date().toISOString(),
            }]);
          }
        }
        break;
      }
      case 'reject_knowledge_proposal': {
        const rejectProposalId = d?.proposalId as string;
        if (rejectProposalId) {
          try {
            await fetch(`/api/knowledge/proposals/${rejectProposalId}/reject`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            });
            setMessages(prev => [...prev, {
              id: generateId(),
              role: 'assistant',
              content: '提案を却下しました。次回のクラスタリングで別の構造が提案されます。',
              timestamp: new Date().toISOString(),
            }]);
          } catch {
            setMessages(prev => [...prev, {
              id: generateId(),
              role: 'assistant',
              content: '提案の却下に失敗しました。',
              timestamp: new Date().toISOString(),
            }]);
          }
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
                      {linkifyText(msg.content, msg.role === 'user')}
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

      {/* ファイルアップロードパネル */}
      {showUploadPanel && (
        <FileUploadPanel
          onClose={() => setShowUploadPanel(false)}
          onUploadComplete={handleUploadComplete}
        />
      )}

      {/* 入力エリア */}
      <div className="border-t border-slate-200 bg-white px-4 py-3 shrink-0">
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <button
            onClick={() => setShowUploadPanel(!showUploadPanel)}
            className={cn(
              'shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-colors',
              showUploadPanel
                ? 'bg-blue-100 text-blue-600'
                : 'text-slate-400 hover:text-blue-600 hover:bg-slate-100'
            )}
            title="ファイルをアップロード"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="秘書に話しかける...（送信ボタンで送信）"
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
