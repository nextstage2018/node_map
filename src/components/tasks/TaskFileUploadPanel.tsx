'use client';

import { useState, useRef } from 'react';
import { cn } from '@/lib/utils';

const DOCUMENT_TYPES = [
  '提案書', '見積書', '契約書', '請求書', '発注書',
  '納品書', '仕様書', '議事録', '報告書', '企画書', 'その他',
];

export interface TaskFileInfo {
  docId: string;
  fileName: string;
  driveUrl: string;
  documentType: string;
}

interface TaskFileUploadPanelProps {
  taskId: string;
  projectId: string;
  onUploadComplete: (file: TaskFileInfo) => void;
  onClose: () => void;
}

export default function TaskFileUploadPanel({
  taskId,
  projectId,
  onUploadComplete,
  onClose,
}: TaskFileUploadPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState('その他');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!file || !projectId) return;
    setUploading(true);
    setError('');

    try {
      // Step 1: サーバーにフォルダ準備 + resumable upload URL取得
      const prepRes = await fetch('/api/drive/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          documentType,
          direction: 'submitted',
          memo: '',
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          fileSize: file.size,
        }),
      });
      const prepResult = await prepRes.json();
      if (!prepResult.success) {
        setError(prepResult.error || 'アップロード準備に失敗しました');
        return;
      }

      const { uploadUrl, metadata } = prepResult.data;

      // Step 2: クライアントからGoogle Drive APIに直接アップロード
      let driveFileId: string | null = null;
      let driveUrl: string | null = null;

      try {
        const fileBuffer = await file.arrayBuffer();
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: fileBuffer,
        });

        if (uploadRes.ok) {
          try {
            const driveFile = await uploadRes.json();
            driveFileId = driveFile.id;
            driveUrl = driveFile.webViewLink || null;
          } catch {
            // CORS制約 → サーバー側で検索
          }
        }
      } catch {
        // CORS制約 → サーバー側で検索
      }

      // Step 3: DB登録 + タスク紐づけ
      const completeRes = await fetch('/api/drive/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...metadata,
          taskId,
          driveFileId: driveFileId || null,
          driveUrl: driveUrl || null,
        }),
      });
      const completeResult = await completeRes.json();

      if (completeResult.success) {
        onUploadComplete({
          docId: completeResult.data.docId,
          fileName: completeResult.data.fileName,
          driveUrl: completeResult.data.driveUrl,
          documentType: completeResult.data.documentType,
        });
      } else {
        setError(completeResult.error || '完了処理に失敗しました');
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError('アップロード中にエラーが発生しました');
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
    <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3 space-y-2 shrink-0">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-500">📎 ファイルを添付</span>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 text-xs"
        >
          ✕ 閉じる
        </button>
      </div>

      {/* ファイル選択エリア */}
      {!file ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'border border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors',
            dragOver
              ? 'border-blue-400 bg-blue-50'
              : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50/50'
          )}
        >
          <p className="text-xs text-slate-500">ドラッグ&ドロップ または クリックで選択</p>
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-white rounded-lg p-2 border border-slate-200">
          <span className="text-lg">📄</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-700 truncate">{file.name}</p>
            <p className="text-[10px] text-slate-400">{formatFileSize(file.size)}</p>
          </div>
          <button
            onClick={() => { setFile(null); setError(''); }}
            className="text-slate-400 hover:text-red-500 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) { setFile(f); setError(''); }
          e.target.value = '';
        }}
      />

      {/* 書類種別 + アップロードボタン */}
      {file && (
        <div className="flex items-center gap-2">
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            className="flex-1 text-xs px-2 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {DOCUMENT_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:bg-slate-300 transition-colors shrink-0"
          >
            {uploading ? '送信中...' : 'アップロード'}
          </button>
        </div>
      )}

      {/* エラー表示 */}
      {error && (
        <p className="text-[11px] text-red-500">{error}</p>
      )}
    </div>
  );
}
