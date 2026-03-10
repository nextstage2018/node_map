// v3.3: プロジェクト関連資料コンポーネント
// Drive連携ドキュメント + URL登録（MS/タスク/ジョブ紐づけ対応）
// タグ検索・削除・編集機能付き
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileText, Plus, Search, X, ExternalLink, Globe, ChevronRight, FolderOpen,
  Trash2, Edit3, Tag, Check, ChevronDown,
} from 'lucide-react';

interface DriveDocument {
  id: string;
  file_name: string | null;
  mime_type: string | null;
  task_id: string | null;
  milestone_id: string | null;
  job_id: string | null;
  link_url: string | null;
  web_view_link: string | null;
  link_type: string | null;
  document_type: string | null;
  tags: string[] | null;
  created_at: string;
}

interface SelectOption {
  id: string;
  name: string;
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
  const [newUrlTags, setNewUrlTags] = useState('');
  const [selectedMilestoneId, setSelectedMilestoneId] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTag, setSearchTag] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 編集モード
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editMsId, setEditMsId] = useState('');
  const [editTaskId, setEditTaskId] = useState('');
  const [editJobId, setEditJobId] = useState('');
  const [editTags, setEditTags] = useState('');

  // 削除確認
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  // プルダウン用データ
  const [milestones, setMilestones] = useState<SelectOption[]>([]);
  const [tasks, setTasks] = useState<SelectOption[]>([]);
  const [jobs, setJobs] = useState<SelectOption[]>([]);
  // 名前解決用マップ
  const [msMap, setMsMap] = useState<Record<string, string>>({});
  const [taskMap, setTaskMap] = useState<Record<string, string>>({});
  const [jobMap, setJobMap] = useState<Record<string, string>>({});

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

  // MS/タスク/ジョブをフェッチ（フォーム展開時とカード表示名解決用）
  const fetchProjectData = useCallback(async () => {
    try {
      const [msRes, taskRes, jobRes] = await Promise.all([
        fetch(`/api/milestones?projectId=${projectId}`),
        fetch(`/api/tasks?project_id=${projectId}`),
        fetch(`/api/jobs?projectId=${projectId}`),
      ]);
      const [msData, taskData, jobData] = await Promise.all([
        msRes.json(), taskRes.json(), jobRes.json(),
      ]);
      const msList = (msData.data || []).map((m: { id: string; title: string }) => ({ id: m.id, name: m.title }));
      const taskList = (taskData.data || []).map((t: { id: string; title: string }) => ({ id: t.id, name: t.title }));
      const jobList = (jobData.data || []).map((j: { id: string; title: string }) => ({ id: j.id, name: j.title }));
      setMilestones(msList);
      setTasks(taskList);
      setJobs(jobList);
      // 名前解決マップ
      const mm: Record<string, string> = {};
      msList.forEach((m: SelectOption) => { mm[m.id] = m.name; });
      setMsMap(mm);
      const tm: Record<string, string> = {};
      taskList.forEach((t: SelectOption) => { tm[t.id] = t.name; });
      setTaskMap(tm);
      const jm: Record<string, string> = {};
      jobList.forEach((j: SelectOption) => { jm[j.id] = j.name; });
      setJobMap(jm);
    } catch { /* */ }
  }, [projectId]);

  useEffect(() => {
    fetchDocuments();
    fetchProjectData();
  }, [fetchDocuments, fetchProjectData]);

  // 全タグを抽出（タグフィルタ用）
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    documents.forEach(doc => {
      (doc.tags || []).forEach(t => tagSet.add(t));
    });
    return Array.from(tagSet).sort();
  }, [documents]);

  // URL登録
  const addUrl = async () => {
    if (!newUrl.trim() || !newUrlTitle.trim()) return;
    const parsedTags = newUrlTags.trim()
      ? newUrlTags.split(/[,、\s]+/).map(t => t.trim()).filter(Boolean)
      : undefined;
    try {
      const res = await fetch('/api/drive/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          title: newUrlTitle.trim(),
          google_drive_url: newUrl.trim(),
          is_external_url: true,
          milestoneId: selectedMilestoneId || undefined,
          taskId: selectedTaskId || undefined,
          jobId: selectedJobId || undefined,
          tags: parsedTags,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg('success', '資料を追加しました');
        setNewUrl('');
        setNewUrlTitle('');
        setNewUrlTags('');
        setSelectedMilestoneId('');
        setSelectedTaskId('');
        setSelectedJobId('');
        setShowAddUrl(false);
        fetchDocuments();
      } else {
        showMsg('error', data.error || '追加に失敗しました');
      }
    } catch {
      showMsg('error', '通信エラー');
    }
  };

  // 削除
  const deleteDocument = async (docId: string) => {
    try {
      const res = await fetch(`/api/drive/documents/${docId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showMsg('success', '資料を削除しました');
        setDocuments(prev => prev.filter(d => d.id !== docId));
      } else {
        showMsg('error', data.error || '削除に失敗しました');
      }
    } catch {
      showMsg('error', '通信エラー');
    }
    setDeletingDocId(null);
  };

  // 編集開始
  const startEdit = (doc: DriveDocument) => {
    setEditingDocId(doc.id);
    setEditTitle(doc.file_name || '');
    setEditMsId(doc.milestone_id || '');
    setEditTaskId(doc.task_id || '');
    setEditJobId(doc.job_id || '');
    setEditTags((doc.tags || []).join(', '));
  };

  // 編集保存
  const saveEdit = async () => {
    if (!editingDocId) return;
    const parsedTags = editTags.trim()
      ? editTags.split(/[,、\s]+/).map(t => t.trim()).filter(Boolean)
      : [];
    try {
      const res = await fetch(`/api/drive/documents/${editingDocId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: editTitle.trim() || undefined,
          milestone_id: editMsId || null,
          task_id: editTaskId || null,
          job_id: editJobId || null,
          tags: parsedTags,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg('success', '更新しました');
        setEditingDocId(null);
        fetchDocuments();
      } else {
        showMsg('error', data.error || '更新に失敗しました');
      }
    } catch {
      showMsg('error', '通信エラー');
    }
  };

  // フィルタリング（タイトル + タグ）
  const filtered = documents.filter(doc => {
    const matchTitle = !searchQuery ||
      (doc.file_name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchTag = !searchTag ||
      (doc.tags || []).some(t => t === searchTag);
    return matchTitle && matchTag;
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

  // カード内のフォルダパスを生成
  const buildFolderPath = (doc: DriveDocument): string[] => {
    const parts: string[] = [];
    if (doc.milestone_id && msMap[doc.milestone_id]) {
      parts.push(msMap[doc.milestone_id]);
    }
    if (doc.task_id && taskMap[doc.task_id]) {
      parts.push(taskMap[doc.task_id]);
    }
    if (doc.job_id && jobMap[doc.job_id]) {
      parts.push(jobMap[doc.job_id]);
    }
    return parts;
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
      {/* ページパンくず */}
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
          <Plus className="w-3.5 h-3.5" />資料を追加
        </button>
      </div>

      {message && (
        <div className={`px-3 py-2 rounded-lg text-xs font-medium ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>{message.text}</div>
      )}

      {/* 資料追加フォーム */}
      {showAddUrl && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">資料を追加</h3>
            <button onClick={() => setShowAddUrl(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">タイトル <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={newUrlTitle}
              onChange={(e) => setNewUrlTitle(e.target.value)}
              placeholder="例: SEO月次レポート、競合調査シート"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">URL <span className="text-red-500">*</span></label>
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* タグ入力 */}
          <div>
            <label className="text-xs text-slate-600 mb-1 block">タグ（カンマ区切り）</label>
            <input
              type="text"
              value={newUrlTags}
              onChange={(e) => setNewUrlTags(e.target.value)}
              placeholder="例: レポート, SEO, 月次"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 格納先プルダウン */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">マイルストーン</label>
              <select
                value={selectedMilestoneId}
                onChange={(e) => setSelectedMilestoneId(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">指定なし</option>
                {milestones.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">タスク</label>
              <select
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">指定なし</option>
                {tasks.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">ジョブ</label>
              <select
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">指定なし</option>
                {jobs.map(j => (
                  <option key={j.id} value={j.id}>{j.name}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={addUrl}
            disabled={!newUrl.trim() || !newUrlTitle.trim()}
            className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >追加</button>
        </div>
      )}

      {/* 検索・フィルタ */}
      {documents.length > 0 && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="タイトルで検索..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {allTags.length > 0 && (
            <div className="relative">
              <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <select
                value={searchTag}
                onChange={(e) => setSearchTag(e.target.value)}
                className="pl-8 pr-6 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
              >
                <option value="">全タグ</option>
                {allTags.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
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
            const viewUrl = doc.web_view_link || doc.link_url;
            const isExternal = viewUrl && !viewUrl.includes('drive.google.com');
            const displayName = doc.file_name || '(名称なし)';
            const folderPath = buildFolderPath(doc);
            const isEditing = editingDocId === doc.id;
            const isDeleting = deletingDocId === doc.id;

            // URLのドメインをサブラベルに表示
            let urlDomain = '';
            try { urlDomain = new URL(viewUrl || '').hostname.replace('www.', ''); } catch { /* */ }

            // 編集モード表示
            if (isEditing) {
              return (
                <div key={doc.id} className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-blue-700">資料を編集</span>
                    <button onClick={() => setEditingDocId(null)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 mb-0.5 block">タイトル</label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 mb-0.5 block">タグ（カンマ区切り）</label>
                    <input
                      type="text"
                      value={editTags}
                      onChange={(e) => setEditTags(e.target.value)}
                      placeholder="レポート, SEO, 月次"
                      className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500 mb-0.5 block">MS</label>
                      <select value={editMsId} onChange={(e) => setEditMsId(e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white">
                        <option value="">指定なし</option>
                        {milestones.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 mb-0.5 block">タスク</label>
                      <select value={editTaskId} onChange={(e) => setEditTaskId(e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white">
                        <option value="">指定なし</option>
                        {tasks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 mb-0.5 block">ジョブ</label>
                      <select value={editJobId} onChange={(e) => setEditJobId(e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white">
                        <option value="">指定なし</option>
                        {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveEdit}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                      <Check className="w-3 h-3" />保存
                    </button>
                    <button onClick={() => setEditingDocId(null)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                      キャンセル
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div key={doc.id} className="group relative p-3 bg-white border border-slate-200 rounded-lg hover:border-slate-300 hover:shadow-sm transition-all">
                {/* 削除確認オーバーレイ */}
                {isDeleting && (
                  <div className="absolute inset-0 bg-white/95 rounded-lg flex items-center justify-center z-10">
                    <div className="text-center space-y-2">
                      <p className="text-xs text-slate-600">この資料を削除しますか？</p>
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => deleteDocument(doc.id)}
                          className="px-3 py-1 text-xs font-medium text-white bg-red-500 rounded hover:bg-red-600">
                          削除
                        </button>
                        <button onClick={() => setDeletingDocId(null)}
                          className="px-3 py-1 text-xs font-medium text-slate-600 bg-slate-100 rounded hover:bg-slate-200">
                          キャンセル
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  {isExternal ? (
                    <Globe className={`w-4 h-4 shrink-0 mt-0.5 ${getFileColor(doc.mime_type, viewUrl)}`} />
                  ) : (
                    <FileText className={`w-4 h-4 shrink-0 mt-0.5 ${getFileColor(doc.mime_type, viewUrl)}`} />
                  )}
                  <div className="flex-1 min-w-0">
                    {/* カード内パンくず（格納先） */}
                    {folderPath.length > 0 && (
                      <div className="flex items-center gap-1 mb-0.5">
                        <FolderOpen className="w-3 h-3 text-slate-300" />
                        {folderPath.map((part, i) => (
                          <span key={i} className="flex items-center gap-1 text-[10px] text-slate-400">
                            {i > 0 && <ChevronRight className="w-2.5 h-2.5" />}
                            {part}
                          </span>
                        ))}
                      </div>
                    )}
                    <a
                      href={viewUrl || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-slate-700 hover:text-blue-600 truncate block"
                    >
                      {displayName}
                    </a>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] text-slate-400">
                        {new Date(doc.created_at).toLocaleDateString('ja-JP')}
                      </span>
                      {urlDomain && (
                        <span className="text-[10px] text-slate-300 truncate max-w-[200px]">{urlDomain}</span>
                      )}
                      {/* タグ表示 */}
                      {(doc.tags || []).length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {(doc.tags || []).map((tag, i) => (
                            <button
                              key={i}
                              onClick={() => setSearchTag(searchTag === tag ? '' : tag)}
                              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded-full transition-colors ${
                                searchTag === tag
                                  ? 'bg-blue-100 text-blue-700 border border-blue-200'
                                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                              }`}
                            >
                              <Tag className="w-2 h-2" />{tag}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* アクションボタン */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); startEdit(doc); }}
                      className="p-1 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                      title="編集"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeletingDocId(doc.id); }}
                      className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      title="削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href={viewUrl || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-slate-300 hover:text-blue-500 transition-colors"
                      title="開く"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
