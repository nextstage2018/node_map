// v3.3: プロジェクト関連資料コンポーネント
// Drive連携ドキュメント + URL登録 + タグ検索
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FileText, Plus, Search, X, ExternalLink, Globe, Tag, Filter,
} from 'lucide-react';

interface DriveDocument {
  id: string;
  file_name: string | null;
  title: string | null;
  google_drive_url: string | null;
  mime_type: string | null;
  task_id: string | null;
  milestone_id: string | null;
  job_id: string | null;
  tags: string[] | null;
  created_at: string;
}

interface Props {
  projectId: string;
  projectName: string;
}

export default function ProjectResources({ projectId, projectName }: Props) {
  const [documents, setDocuments] = useState<DriveDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddUrl, setShowAddUrl] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newUrlTitle, setNewUrlTitle] = useState('');
  const [newUrlTags, setNewUrlTags] = useState('');
  const [filterTag, setFilterTag] = useState('');
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
      const tags = newUrlTags.trim()
        ? newUrlTags.split(/[,、\s]+/).filter(Boolean)
        : [];
      const res = await fetch('/api/drive/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          title: newUrlTitle.trim() || newUrl.trim(),
          google_drive_url: newUrl.trim(),
          tags,
          is_external_url: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg('success', 'URLを追加しました');
        setNewUrl('');
        setNewUrlTitle('');
        setNewUrlTags('');
        setShowAddUrl(false);
        fetchDocuments();
      } else {
        showMsg('error', data.error || '追加に失敗しました');
      }
    } catch {
      showMsg('error', '通信エラー');
    }
  };

  // 全タグを収集
  const allTags = Array.from(new Set(
    documents.flatMap(d => d.tags || [])
  )).sort();

  // フィルタリング
  const filtered = documents.filter(doc => {
    const matchSearch = !searchQuery ||
      (doc.file_name || doc.title || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchTag = !filterTag ||
      (doc.tags || []).includes(filterTag);
    return matchSearch && matchTag;
  });

  // ファイル種別アイコン色
  const getFileColor = (mimeType: string | null, url: string | null) => {
    if (url && !url.includes('drive.google.com')) return 'text-indigo-500'; // 外部URL
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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-800">{projectName} - 関連資料</h2>
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
            <label className="text-xs text-slate-600 mb-1 block">タイトル（任意）</label>
            <input
              type="text"
              value={newUrlTitle}
              onChange={(e) => setNewUrlTitle(e.target.value)}
              placeholder="例: SEO月次レポート"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">タグ（カンマ区切り、任意）</label>
            <input
              type="text"
              value={newUrlTags}
              onChange={(e) => setNewUrlTags(e.target.value)}
              placeholder="例: SEO, レポート, 月次"
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

      {/* 検索・フィルタ */}
      {documents.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ファイル名で検索..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {allTags.length > 0 && (
            <div className="relative">
              <select
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                className="appearance-none pl-7 pr-8 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">全タグ</option>
                {allTags.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
              <Filter className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          )}
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
            const isExternal = doc.google_drive_url && !doc.google_drive_url.includes('drive.google.com');
            const displayName = doc.title || doc.file_name || 'Untitled';
            return (
              <div key={doc.id} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg group hover:border-slate-300 transition-colors">
                {isExternal ? (
                  <Globe className={`w-4 h-4 shrink-0 ${getFileColor(doc.mime_type, doc.google_drive_url)}`} />
                ) : (
                  <FileText className={`w-4 h-4 shrink-0 ${getFileColor(doc.mime_type, doc.google_drive_url)}`} />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 truncate">{displayName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-slate-400">
                      {new Date(doc.created_at).toLocaleDateString('ja-JP')}
                    </span>
                    {(doc.tags || []).map(tag => (
                      <span key={tag} className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-slate-100 text-slate-500">
                        <Tag className="w-2.5 h-2.5" />{tag}
                      </span>
                    ))}
                  </div>
                </div>
                {doc.google_drive_url && (
                  <a
                    href={doc.google_drive_url}
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
