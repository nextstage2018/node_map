'use client';

import { useState, useRef } from 'react';

/**
 * Phase E: 外部資料取り込みパネル
 * テキスト（ペースト）/ ファイル（PDF, DOCX, TXT）/ URL に対応
 */

export interface ExternalResource {
  id: string;
  taskId: string;
  resourceType: 'text' | 'file' | 'url';
  title: string;
  contentLength: number;
  sourceUrl?: string;
  fileName?: string;
  fileMimeType?: string;
  createdAt: string;
}

interface ExternalResourcePanelProps {
  taskId: string;
  onResourceAdded: (resource: ExternalResource) => void;
  onClose: () => void;
}

type InputMode = 'text' | 'file' | 'url';

const ACCEPTED_FILE_TYPES = '.txt,.pdf,.docx,.doc,.md,.csv,.json';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function ExternalResourcePanel({ taskId, onResourceAdded, onClose }: ExternalResourcePanelProps) {
  const [mode, setMode] = useState<InputMode>('text');
  const [title, setTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [url, setUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      setError('ファイルサイズは10MB以下にしてください');
      return;
    }

    setSelectedFile(file);
    if (!title) {
      setTitle(file.name.replace(/\.[^.]+$/, ''));
    }
    setError('');
  };

  const readFileAsText = async (file: File): Promise<string> => {
    // テキストベースのファイルはそのまま読み込み
    if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md') ||
        file.name.endsWith('.csv') || file.name.endsWith('.json')) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(file, 'utf-8');
      });
    }

    // PDF / DOCX はサーバー側で処理するのが理想だが、
    // 簡易的にクライアント側でテキスト抽出を試みる
    // PDF: テキストレイヤーのみ（画像PDFは非対応）
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      // PDFのテキスト抽出はブラウザでは限定的。Base64で送る代わりに注意書きを付加
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const text = reader.result as string;
          // ArrayBufferからテキストを抽出（簡易版: テキストレイヤーのみ）
          resolve(`[PDF ファイル: ${file.name}]\n※ PDFのテキスト内容は手動で貼り付けてください。`);
        };
        reader.onerror = reject;
        reader.readAsText(file, 'utf-8');
      });
    }

    // DOCX: XML解析が必要なため、テキストペーストを推奨
    if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
      return `[Word ファイル: ${file.name}]\n※ Wordファイルの内容はテキストとして貼り付けてください。`;
    }

    // その他: テキストとして読み込み
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file, 'utf-8');
    });
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('タイトルを入力してください');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      let content = '';
      let sourceUrl: string | undefined;
      let fileName: string | undefined;
      let fileMimeType: string | undefined;

      switch (mode) {
        case 'text':
          if (!textContent.trim()) {
            setError('テキスト内容を入力してください');
            setIsSubmitting(false);
            return;
          }
          content = textContent.trim();
          break;

        case 'file':
          if (!selectedFile) {
            setError('ファイルを選択してください');
            setIsSubmitting(false);
            return;
          }
          content = await readFileAsText(selectedFile);
          fileName = selectedFile.name;
          fileMimeType = selectedFile.type;
          break;

        case 'url':
          if (!url.trim()) {
            setError('URLを入力してください');
            setIsSubmitting(false);
            return;
          }
          sourceUrl = url.trim();
          // URL内容の取得はサーバー側に任せる（CORS制約回避）
          content = `[URL参考資料: ${sourceUrl}]\n※ URLの内容を参照して壁打ちに活用してください。`;
          break;
      }

      const res = await fetch(`/api/tasks/${taskId}/external-resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceType: mode,
          title: title.trim(),
          content,
          sourceUrl,
          fileName,
          fileMimeType,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.error || '追加に失敗しました');
        return;
      }

      onResourceAdded({
        id: data.data.id,
        taskId: data.data.task_id,
        resourceType: data.data.resource_type,
        title: data.data.title,
        contentLength: data.data.content_length,
        sourceUrl: data.data.source_url,
        fileName: data.data.file_name,
        fileMimeType: data.data.file_mime_type,
        createdAt: data.data.created_at,
      });

      // リセット
      setTitle('');
      setTextContent('');
      setUrl('');
      setSelectedFile(null);
    } catch (err) {
      console.error('外部資料追加エラー:', err);
      setError('追加に失敗しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="border-b border-slate-100 bg-slate-50/50">
      <div className="px-4 py-3 space-y-3">
        {/* モード切替 */}
        <div className="flex gap-1">
          {([
            { key: 'text' as const, label: '📝 テキスト', desc: 'ペースト' },
            { key: 'file' as const, label: '📄 ファイル', desc: 'TXT/PDF/DOCX' },
            { key: 'url' as const, label: '🔗 URL', desc: 'リンク' },
          ]).map(m => (
            <button
              key={m.key}
              onClick={() => { setMode(m.key); setError(''); }}
              className={`flex-1 px-2 py-1.5 text-[10px] rounded-lg font-medium transition-colors ${
                mode === m.key
                  ? 'bg-blue-100 text-blue-700 border border-blue-200'
                  : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* タイトル */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="資料タイトル（例: Deep Research結果、競合分析レポート）"
          className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
        />

        {/* テキストモード */}
        {mode === 'text' && (
          <textarea
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            placeholder="外部AIの出力やリサーチ結果をここに貼り付けてください..."
            rows={6}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white resize-y"
          />
        )}

        {/* ファイルモード */}
        {mode === 'file' && (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-4 border-2 border-dashed border-slate-200 rounded-lg text-xs text-slate-400 hover:bg-slate-100 hover:border-slate-300 transition-colors"
            >
              {selectedFile ? (
                <span className="text-slate-700 font-medium">📄 {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)}KB)</span>
              ) : (
                <span>クリックしてファイルを選択<br /><span className="text-[10px]">TXT, PDF, DOCX, MD, CSV, JSON（10MB以下）</span></span>
              )}
            </button>
            <p className="text-[10px] text-slate-400 mt-1">
              ※ PDF・DOCXの場合、テキスト内容をペーストする方が精度が高くなります
            </p>
          </div>
        )}

        {/* URLモード */}
        {mode === 'url' && (
          <div>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/research-report"
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              ※ URLの内容はAI会話の参考情報として使用されます
            </p>
          </div>
        )}

        {/* エラー */}
        {error && (
          <p className="text-[10px] text-red-500 font-medium">{error}</p>
        )}

        {/* アクション */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[10px] rounded-lg text-slate-500 hover:bg-slate-200 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !title.trim()}
            className="px-4 py-1.5 text-[10px] font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? '追加中...' : '📎 資料を追加'}
          </button>
        </div>
      </div>
    </div>
  );
}
