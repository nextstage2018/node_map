// v3.3: プロジェクト関連資料コンポーネント
// Drive連携ドキュメント + URL登録
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FileText, Plus, Search, X, ExternalLink, Globe, ChevronRight,
} from 'lucide-react';

interface DriveDocument {
  id: string;
  file_name: string | null;
  mime_type: string | null;
  task_id: string | null;
  link_url: string | null;
  web_view_link: string | null;
  link_type: string | null;
  document_type: string | null;
  created_at: string;
}

interface Props {
  projectId: string;
  projectName: string;
  organizationName?: string | null;
}

export default function ProjectResources({ projectId, projectName, organizationName }: Props) {
  const [documents, setDocuments] = useState<DriveDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddUrl, setShowAddUrl] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newUrlTitle, setNewUrlTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/drive/documents?projectId=${projectId}`);
      const data = await res.json();
      if (data.success) setDocuments(data.data || []);
    } catch { /* */ }
    setIsLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // URL登録（drive_documentsにメタ情報として保存）
  const addUrl = async () => {
    if (!newUrl.trim()) return;
    try {
      const res = await fetch('/api/drive/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          title: newUrlTitle.trim() || newUrl.trim(),
          google_drive_url: newUrl.trim(),
          is_external_url: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg('success', 'URLを追加しました');
        setNewUrl('');
        setNewUrlTitle('');
        setShowAddUrl(false);
        fetchDocuments();
      } else {
        showMsg('error', data.error || '追加に失敗しました');
      }
    } catch {
      showMsg('error', '通信エラー');
    }
  };

  // フィルタリング
  const filtered = documents.filter(doc => {
    if (!searchQuery) return true;
    return (doc.file_name || '').toLowerCase().includes(searchQuery.toLowerCase());
  });

  // ファイル種別アイコン色
  const getFileColor = (mimeType: string | null, url: string | null) => {
    if (url && !url.includes('drive.google.com')) return 'text-indigo-500';
    if (mimeType?.includes('spreadsheet')) return 'text-green-600';
    if (mimeType?.includes('presentation')) return 'text-amber-600';
    if (mimeType?.includes('document')) return 'text-blue-600';
    if (mimeType?.includes('pdf')) return 'text-red-500';
    return 'text-slate-400';
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center py-16">
        <div className="animate-spin text-2xl">&#8987;</div>
      </div>
    );
  }

  // URLからドメイン名を抽出してわかりやすいファイル名にする
  const formatDisplayName = (doc: DriveDocument): string => {
    // タイトルがURLでなければそのまま表示
    const name = doc.file_name || '';
    if (name && !name.startsWith('http')) return name;
    // URLの場合はドメイン+パスを見やすくする
    try {
      const url = new URL(name || doc.link_url || '');
      const host = url.hostname.replace('www.', '');
      // Google系はサービス名を表示
      if (host.includes('docs.google.com')) {
        const pathParts = url.pathname.split('/');
        const type = pathParts[1] || '';
        const typeLabels: Record<string, string> = { spreadsheets: 'スプレッドシート', document: 'ドキュメント', presentation: 'スライド', forms: 'フォーム' };
        return typeLabels[type] || `Google ${type}`;
      }
      return host;
    } catch {
      return name || '(名称なし)';
    }
  };

  return (
    <div className="p-6 space-y-4">
      {/* パンくずナビゲーション */}
      <div className="flex items-center gap-1 text-[11px] text-slate-400">
        {organizationName && (
          <>
            <span>{organizationName}</span>
            <ChevronRight className="w-3 h-3" />
          </>
        )}
        <span>{projectName}</span>
        <ChevronRight className="w-3 h-3" />
        <span className="text-slate-600 font-medium">関連資料</span>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-800">関連資料</h2>
        <button
          onClick={() => setShowAddUrl(!showAddUrl)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />URL追加
        </button>
      </div>

      {message && (
        <div className={`px-3 py-2 rounded-lg text-xs font-medium ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>{message.text}</div>
      )}

      {/* URL追加フォーム */}
      {showAddUrl && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">外部URLを追加</h3>
            <button onClick={() => setShowAddUrl(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">URL</label>
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">タイトル（入力推奨 — 未入力だとURLがそのまま表示されます）</label>
            <input
              type="text"
              value={newUrlTitle}
              onChange={(e) => setNewUrlTitle(e.target.value)}
              placeholder="例: SEO月次レポート"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={addUrl}
            disabled={!newUrl.trim()}
            className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >追加</button>
        </div>
      )}

      {/* 検索 */}
      {documents.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ファイル名で検索..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {/* ドキュメント一覧 */}
      {filtered.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-slate-400">
          <div className="text-center">
            <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs">
              {documents.length === 0 ? '関連資料がありません' : '検索条件に一致する資料がありません'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(doc => {
            const viewUrl = doc.web_view_link || doc.link_url;
            const isExternal = viewUrl && !viewUrl.includes('drive.google.com');
            const displayName = formatDisplayName(doc);
            // URLのドメインをサブラベルに表示
            let urlDomain = '';
            try { urlDomain = new URL(viewUrl || '').hostname.replace('www.', ''); } catch { /* */ }
            return (
              <div key={doc.id} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg group hover:border-slate-300 transition-colors">
                {isExternal ? (
                  <Globe className={`w-4 h-4 shrink-0 ${getFileColor(doc.mime_type, viewUrl)}`} />
                ) : (
                  <FileText className={`w-4 h-4 shrink-0 ${getFileColor(doc.mime_type, viewUrl)}`} />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{displayName}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400">
                      {new Date(doc.created_at).toLocaleDateString('ja-JP')}
                      {doc.document_type && ` · ${doc.document_type}`}
                    </span>
                    {urlDomain && (
                      <span className="text-[10px] text-slate-300 truncate max-w-[200px]">{urlDomain}</span>
                    )}
                  </div>
                </div>
                {viewUrl && (
                  <a
                    href={viewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    title="開く"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
