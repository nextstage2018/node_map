// v3.3: プロジェクト関連資料コンポーネント
// ファイルアップロード + URL登録（MS/タスク/ジョブ紐づけ対応）
// 書類種別プリセット・タグ選択式・命名規則統一・ユーザー名自動タグ
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  FileText, Plus, Search, X, ExternalLink, Globe, ChevronRight, FolderOpen,
  Trash2, Edit3, Tag, Check, ChevronDown, Upload, Link2, Loader2,
} from 'lucide-react';

// 書類種別プリセット
const DOCUMENT_TYPES = [
  { value: 'proposal', label: '提案資料' },
  { value: 'estimate', label: '見積書' },
  { value: 'contract', label: '契約書' },
  { value: 'invoice', label: '請求書' },
  { value: 'report', label: 'レポート' },
  { value: 'minutes', label: '議事録' },
  { value: 'manual', label: 'マニュアル' },
  { value: 'design', label: 'デザイン' },
  { value: 'specification', label: '仕様書' },
  { value: 'other', label: 'その他' },
] as const;

// 書類種別 value → 日本語ラベル
const DOC_TYPE_LABEL: Record<string, string> = {};
DOCUMENT_TYPES.forEach(d => { DOC_TYPE_LABEL[d.value] = d.label; });

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
  organizationId?: string;
  organizationName?: string | null;
}

export default function ProjectResources({ projectId, projectName, organizationId, organizationName }: Props) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ユーザー表示名
  const userName = user?.user_metadata?.display_name
    || user?.user_metadata?.full_name
    || user?.email
    || '';

  // サブタブ: 'registered' | 'received'
  const [activeSubTab, setActiveSubTab] = useState<'registered' | 'received'>('registered');
  const [documents, setDocuments] = useState<DriveDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // 追加モード: 'url' | 'file' | null
  const [addMode, setAddMode] = useState<'url' | 'file' | null>(null);

  // 共通フォームフィールド
  const [formDocType, setFormDocType] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formMsId, setFormMsId] = useState('');
  const [formTaskId, setFormTaskId] = useState('');
  const [formJobId, setFormJobId] = useState('');
  const [formExtraTags, setFormExtraTags] = useState<string[]>([]);

  // URL登録用
  const [formUrl, setFormUrl] = useState('');
  // ファイルアップロード用
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // 検索
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTag, setSearchTag] = useState('');

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 編集モード
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDocType, setEditDocType] = useState('');
  const [editMsId, setEditMsId] = useState('');
  const [editTaskId, setEditTaskId] = useState('');
  const [editJobId, setEditJobId] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);

  // 削除確認
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  // プルダウン用データ
  const [milestones, setMilestones] = useState<SelectOption[]>([]);
  const [tasks, setTasks] = useState<SelectOption[]>([]);
  const [jobs, setJobs] = useState<SelectOption[]>([]);
  const [msMap, setMsMap] = useState<Record<string, string>>({});
  const [taskMap, setTaskMap] = useState<Record<string, string>>({});
  const [jobMap, setJobMap] = useState<Record<string, string>>({});

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  // v3.3命名規則: YYYY-MM-DD_書類種別_ファイル名
  const buildFileName = (docType: string, baseName: string): string => {
    const date = new Date().toISOString().slice(0, 10);
    const typeLabel = DOC_TYPE_LABEL[docType] || docType;
    // 拡張子を保持
    const dotIdx = baseName.lastIndexOf('.');
    const ext = dotIdx > 0 ? baseName.slice(dotIdx) : '';
    const nameWithoutExt = dotIdx > 0 ? baseName.slice(0, dotIdx) : baseName;
    return `${date}_${typeLabel}_${nameWithoutExt}${ext}`;
  };

  // タグの自動構築（MS名・タスク名・ジョブ名 + 書類種別 + ユーザー名 + 追加タグ）
  const buildTags = (docType: string, msId: string, taskId: string, jobId: string, extra: string[]): string[] => {
    const tagSet = new Set<string>();
    // 書類種別
    if (docType && DOC_TYPE_LABEL[docType]) tagSet.add(DOC_TYPE_LABEL[docType]);
    // MS名
    if (msId && msMap[msId]) tagSet.add(msMap[msId]);
    // タスク名
    if (taskId && taskMap[taskId]) tagSet.add(taskMap[taskId]);
    // ジョブ名
    if (jobId && jobMap[jobId]) tagSet.add(jobMap[jobId]);
    // 追加タグ
    extra.forEach(t => { if (t.trim()) tagSet.add(t.trim()); });
    // ユーザー名は API 側で自動追加（二重追加防止のためここでは入れない）
    return Array.from(tagSet);
  };

  const fetchDocuments = useCallback(async (category?: string) => {
    setIsLoading(true);
    try {
      const cat = category || activeSubTab;
      const res = await fetch(`/api/drive/documents?projectId=${projectId}&category=${cat}`);
      const data = await res.json();
      if (data.success) setDocuments(data.data || []);
    } catch { /* */ }
    setIsLoading(false);
  }, [projectId, activeSubTab]);

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

  // サブタブ切り替え時にデータ再取得
  useEffect(() => {
    fetchDocuments(activeSubTab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubTab]);

  // 全タグ（フィルタ用）
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    documents.forEach(doc => {
      (doc.tags || []).forEach(t => tagSet.add(t));
    });
    return Array.from(tagSet).sort();
  }, [documents]);

  // フォームリセット
  const resetForm = () => {
    setAddMode(null);
    setFormDocType('');
    setFormTitle('');
    setFormMsId('');
    setFormTaskId('');
    setFormJobId('');
    setFormExtraTags([]);
    setFormUrl('');
    setSelectedFile(null);
  };

  // ファイル選択
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // タイトル未入力ならファイル名をベースにセット
      if (!formTitle) {
        const dotIdx = file.name.lastIndexOf('.');
        setFormTitle(dotIdx > 0 ? file.name.slice(0, dotIdx) : file.name);
      }
    }
  };

  // 格納先は任意（MS・タスク・ジョブいずれも未選択でもOK）
  const hasLocation = true;

  // URL登録
  const submitUrl = async () => {
    if (!formUrl.trim() || !formTitle.trim() || !formDocType || !hasLocation) return;
    const tags = buildTags(formDocType, formMsId, formTaskId, formJobId, formExtraTags);
    const displayTitle = buildFileName(formDocType, formTitle.trim());
    try {
      const res = await fetch('/api/drive/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          organizationId,
          title: displayTitle,
          google_drive_url: formUrl.trim(),
          is_external_url: true,
          milestoneId: formMsId || undefined,
          taskId: formTaskId || undefined,
          jobId: formJobId || undefined,
          documentType: formDocType,
          tags,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg('success', '資料を追加しました');
        resetForm();
        fetchDocuments();
      } else {
        showMsg('error', data.error || '追加に失敗しました');
      }
    } catch {
      showMsg('error', '通信エラー');
    }
  };

  // ファイルアップロード
  const submitFile = async () => {
    if (!selectedFile || !formTitle.trim() || !formDocType || !hasLocation) return;
    setIsUploading(true);
    try {
      // Base64変換
      const buffer = await selectedFile.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      // ファイル名はAPI側のgenerateV33FileNameで命名規則適用（日付二重付与防止）
      const tags = buildTags(formDocType, formMsId, formTaskId, formJobId, formExtraTags);

      const res = await fetch('/api/drive/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          projectName,
          organizationId,
          organizationName,
          fileName: selectedFile.name,
          mimeType: selectedFile.type || 'application/octet-stream',
          fileData: base64,
          milestoneId: formMsId || undefined,
          milestoneName: formMsId ? msMap[formMsId] : undefined,
          taskId: formTaskId || undefined,
          taskName: formTaskId ? taskMap[formTaskId] : undefined,
          jobId: formJobId || undefined,
          jobName: formJobId ? jobMap[formJobId] : undefined,
          documentType: formDocType,
          tags,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg('success', 'ファイルをアップロードしました');
        resetForm();
        fetchDocuments();
      } else {
        showMsg('error', data.error || 'アップロードに失敗しました');
      }
    } catch {
      showMsg('error', '通信エラー');
    }
    setIsUploading(false);
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
    setEditDocType(doc.document_type || '');
    setEditMsId(doc.milestone_id || '');
    setEditTaskId(doc.task_id || '');
    setEditJobId(doc.job_id || '');
    // ユーザー名・MS名・タスク名等の自動タグは除外して追加タグだけ抽出
    const autoNames = new Set([userName, ...Object.values(msMap), ...Object.values(taskMap), ...Object.values(jobMap)]);
    const extraOnly = (doc.tags || []).filter(t => !autoNames.has(t) && !Object.values(DOC_TYPE_LABEL).includes(t));
    setEditTags(extraOnly);
  };

  // 編集保存
  const saveEdit = async () => {
    if (!editingDocId) return;
    const autoTags = buildTags(editDocType, editMsId, editTaskId, editJobId, editTags);
    // ユーザー名もここでは追加（PUT時はAPI側で自動追加しないため）
    if (userName && !autoTags.includes(userName)) autoTags.push(userName);
    try {
      const res = await fetch(`/api/drive/documents/${editingDocId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: editTitle.trim() || undefined,
          document_type: editDocType || undefined,
          milestone_id: editMsId || null,
          task_id: editTaskId || null,
          job_id: editJobId || null,
          tags: autoTags,
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

  // フィルタ
  const filtered = documents.filter(doc => {
    const matchTitle = !searchQuery ||
      (doc.file_name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchTag = !searchTag ||
      (doc.tags || []).some(t => t === searchTag);
    return matchTitle && matchTag;
  });

  // アイコン色
  const getFileColor = (mimeType: string | null, url: string | null) => {
    if (url && !url.includes('drive.google.com')) return 'text-indigo-500';
    if (mimeType?.includes('spreadsheet')) return 'text-green-600';
    if (mimeType?.includes('presentation')) return 'text-amber-600';
    if (mimeType?.includes('document')) return 'text-blue-600';
    if (mimeType?.includes('pdf')) return 'text-red-500';
    return 'text-slate-400';
  };

  // フォルダパス
  const buildFolderPath = (doc: DriveDocument): string[] => {
    const parts: string[] = [];
    if (doc.milestone_id && msMap[doc.milestone_id]) parts.push(msMap[doc.milestone_id]);
    if (doc.task_id && taskMap[doc.task_id]) parts.push(taskMap[doc.task_id]);
    if (doc.job_id && jobMap[doc.job_id]) parts.push(jobMap[doc.job_id]);
    return parts;
  };

  // 追加タグ入力（チップ式）
  const TagChipInput = ({ tags, setTags }: { tags: string[]; setTags: (t: string[]) => void }) => {
    const [input, setInput] = useState('');
    const addTag = () => {
      const trimmed = input.trim();
      if (trimmed && !tags.includes(trimmed)) {
        setTags([...tags, trimmed]);
      }
      setInput('');
    };
    return (
      <div>
        <label className="text-[10px] text-slate-500 mb-0.5 block">追加タグ（任意）</label>
        <div className="flex flex-wrap gap-1 mb-1">
          {tags.map((t, i) => (
            <span key={i} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] bg-blue-50 text-blue-700 rounded-full border border-blue-200">
              {t}
              <button onClick={() => setTags(tags.filter((_, j) => j !== i))} className="hover:text-red-500">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
            placeholder="タグを入力して Enter"
            className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={addTag} type="button" className="px-2 py-1 text-[10px] text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">追加</button>
        </div>
      </div>
    );
  };

  // 格納先セレクト群（共通）
  const LocationSelects = ({ msId, setMsId, taskId, setTaskId, jobId, setJobId }: {
    msId: string; setMsId: (v: string) => void;
    taskId: string; setTaskId: (v: string) => void;
    jobId: string; setJobId: (v: string) => void;
  }) => (
    <div>
      <p className="text-[10px] text-slate-500 mb-1">格納先（任意）</p>
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="text-[10px] text-slate-500 mb-0.5 block">タスク</label>
        <select value={msId} onChange={(e) => setMsId(e.target.value)}
          className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">指定なし</option>
          {tasks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div>
        <label className="text-[10px] text-slate-500 mb-0.5 block">定期イベント</label>
        <select value={jobId} onChange={(e) => setJobId(e.target.value)}
          className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">指定なし</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
        </select>
      </div>
    </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* パンくず */}
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
        {!addMode && activeSubTab === 'registered' && (
          <div className="flex gap-2">
            <button
              onClick={() => setAddMode('file')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />ファイルを追加
            </button>
            <button
              onClick={() => setAddMode('url')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Link2 className="w-3.5 h-3.5" />URLを追加
            </button>
          </div>
        )}
      </div>

      {/* サブタブ: 登録資料 / 受領資料 */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => { setActiveSubTab('registered'); setSearchQuery(''); setSearchTag(''); }}
          className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeSubTab === 'registered'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >登録資料</button>
        <button
          onClick={() => { setActiveSubTab('received'); setSearchQuery(''); setSearchTag(''); }}
          className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeSubTab === 'received'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >受領資料</button>
      </div>

      {message && (
        <div className={`px-3 py-2 rounded-lg text-xs font-medium ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>{message.text}</div>
      )}

      {/* ======= 追加フォーム ======= */}
      {addMode && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">
              {addMode === 'file' ? 'ファイルをアップロード' : 'URLを追加'}
            </h3>
            <button onClick={resetForm} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>

          {/* 書類種別（必須） */}
          <div>
            <label className="text-xs text-slate-600 mb-1 block">書類種別 <span className="text-red-500">*</span></label>
            <div className="flex flex-wrap gap-1.5">
              {DOCUMENT_TYPES.map(dt => (
                <button
                  key={dt.value}
                  onClick={() => setFormDocType(dt.value)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    formDocType === dt.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'
                  }`}
                >{dt.label}</button>
              ))}
            </div>
          </div>

          {/* ファイル選択（file モード） */}
          {addMode === 'file' && (
            <div>
              <label className="text-xs text-slate-600 mb-1 block">ファイル <span className="text-red-500">*</span></label>
              <input ref={fileInputRef} type="file" onChange={handleFileSelect} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full px-3 py-3 text-sm border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                {selectedFile ? (
                  <span className="flex items-center gap-2 justify-center">
                    <FileText className="w-4 h-4" />
                    {selectedFile.name}（{(selectedFile.size / 1024).toFixed(0)} KB）
                  </span>
                ) : (
                  <span className="flex items-center gap-2 justify-center">
                    <Upload className="w-4 h-4" />
                    クリックしてファイルを選択
                  </span>
                )}
              </button>
            </div>
          )}

          {/* URL入力（url モード） */}
          {addMode === 'url' && (
            <div>
              <label className="text-xs text-slate-600 mb-1 block">URL <span className="text-red-500">*</span></label>
              <input
                type="url"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* 資料名 */}
          <div>
            <label className="text-xs text-slate-600 mb-1 block">
              資料名 <span className="text-red-500">*</span>
              <span className="text-[10px] text-slate-400 ml-2">
                ※ 自動で「日付_書類種別_資料名」に変換されます
              </span>
            </label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="例: A社向けSEO改善、3月分"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {formDocType && formTitle && (
              <p className="mt-1 text-[10px] text-slate-400">
                保存名: {buildFileName(formDocType, addMode === 'file' && selectedFile ? selectedFile.name.replace(/\.[^.]+$/, formTitle ? `_${formTitle}` : '') : formTitle)}
              </p>
            )}
          </div>

          {/* 格納先（任意） */}
          <LocationSelects
            msId={formMsId} setMsId={setFormMsId}
            taskId={formTaskId} setTaskId={setFormTaskId}
            jobId={formJobId} setJobId={setFormJobId}
          />

          {/* 追加タグ */}
          <TagChipInput tags={formExtraTags} setTags={setFormExtraTags} />

          {/* タグプレビュー */}
          {formDocType && (
            <div>
              <label className="text-[10px] text-slate-500 mb-0.5 block">自動付与タグ（プレビュー）</label>
              <div className="flex flex-wrap gap-1">
                {buildTags(formDocType, formMsId, formTaskId, formJobId, formExtraTags).map((t, i) => (
                  <span key={i} className="px-1.5 py-0.5 text-[10px] bg-slate-100 text-slate-600 rounded-full">{t}</span>
                ))}
                {userName && (
                  <span className="px-1.5 py-0.5 text-[10px] bg-green-50 text-green-600 rounded-full border border-green-200">{userName}</span>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={addMode === 'file' ? submitFile : submitUrl}
              disabled={
                !formDocType || !formTitle.trim() || !hasLocation ||
                (addMode === 'file' ? !selectedFile || isUploading : !formUrl.trim())
              }
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : addMode === 'file' ? <Upload className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {isUploading ? 'アップロード中...' : addMode === 'file' ? 'アップロード' : '追加'}
            </button>
            <button onClick={resetForm} className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* ======= 検索・フィルタ ======= */}
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

      {/* ======= ドキュメント一覧 ======= */}
      {filtered.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-slate-400">
          <div className="text-center">
            <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs">{documents.length === 0 ? '関連資料がありません' : '検索条件に一致する資料がありません'}</p>
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
            const docTypeLabel = doc.document_type ? (DOC_TYPE_LABEL[doc.document_type] || doc.document_type) : '';

            let urlDomain = '';
            try { urlDomain = new URL(viewUrl || '').hostname.replace('www.', ''); } catch { /* */ }

            // 編集モード
            if (isEditing) {
              return (
                <div key={doc.id} className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-blue-700">資料を編集</span>
                    <button onClick={() => setEditingDocId(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 mb-0.5 block">タイトル</label>
                    <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 mb-0.5 block">書類種別</label>
                    <div className="flex flex-wrap gap-1">
                      {DOCUMENT_TYPES.map(dt => (
                        <button key={dt.value} onClick={() => setEditDocType(dt.value)}
                          className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                            editDocType === dt.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'
                          }`}>{dt.label}</button>
                      ))}
                    </div>
                  </div>
                  <LocationSelects
                    msId={editMsId} setMsId={setEditMsId}
                    taskId={editTaskId} setTaskId={setEditTaskId}
                    jobId={editJobId} setJobId={setEditJobId}
                  />
                  <TagChipInput tags={editTags} setTags={setEditTags} />
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
                {/* 削除確認 */}
                {isDeleting && (
                  <div className="absolute inset-0 bg-white/95 rounded-lg flex items-center justify-center z-10">
                    <div className="text-center space-y-2">
                      <p className="text-xs text-slate-600">この資料を削除しますか？</p>
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => deleteDocument(doc.id)}
                          className="px-3 py-1 text-xs font-medium text-white bg-red-500 rounded hover:bg-red-600">削除</button>
                        <button onClick={() => setDeletingDocId(null)}
                          className="px-3 py-1 text-xs font-medium text-slate-600 bg-slate-100 rounded hover:bg-slate-200">キャンセル</button>
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
                    {/* フォルダパス */}
                    {folderPath.length > 0 && (
                      <div className="flex items-center gap-1 mb-0.5">
                        <FolderOpen className="w-3 h-3 text-slate-300" />
                        {folderPath.map((part, i) => (
                          <span key={i} className="flex items-center gap-1 text-[10px] text-slate-400">
                            {i > 0 && <ChevronRight className="w-2.5 h-2.5" />}{part}
                          </span>
                        ))}
                      </div>
                    )}
                    <a href={viewUrl || '#'} target="_blank" rel="noopener noreferrer"
                      className="text-sm font-medium text-slate-700 hover:text-blue-600 truncate block">
                      {displayName}
                    </a>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] text-slate-400">{new Date(doc.created_at).toLocaleDateString('ja-JP')}</span>
                      {docTypeLabel && (
                        <span className="px-1.5 py-0.5 text-[10px] bg-slate-100 text-slate-500 rounded-full">{docTypeLabel}</span>
                      )}
                      {urlDomain && <span className="text-[10px] text-slate-300 truncate max-w-[200px]">{urlDomain}</span>}
                      {(doc.tags || []).length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {(doc.tags || []).map((tag, i) => (
                            <button key={i} onClick={() => setSearchTag(searchTag === tag ? '' : tag)}
                              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded-full transition-colors ${
                                searchTag === tag ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                              }`}>
                              <Tag className="w-2 h-2" />{tag}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* アクション */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); startEdit(doc); }}
                      className="p-1 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors" title="編集">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setDeletingDocId(doc.id); }}
                      className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="削除">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <a href={viewUrl || '#'} target="_blank" rel="noopener noreferrer"
                      className="p-1 text-slate-300 hover:text-blue-500 transition-colors" title="開く">
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
