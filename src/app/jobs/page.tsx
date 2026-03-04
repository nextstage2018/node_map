// Phase 58+: ジョブページ — 進行中/完了アーカイブタブ + 検索フィルタ
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Job } from '@/lib/types';
import AppLayout from '@/components/shared/AppLayout';
import ContextBar from '@/components/shared/ContextBar';
import Button from '@/components/ui/Button';
import {
  Plus, Check, Trash2, Calendar, ChevronDown, ChevronUp,
  Send, MessageSquare, Clock, AlertCircle, Search, Archive, X,
} from 'lucide-react';

// タイプ設定
const JOB_TYPE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  schedule: { icon: '📅', label: '日程調整', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  consult: { icon: '💬', label: '社内相談', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  save_to_drive: { icon: '📁', label: 'Drive保存', color: 'bg-green-50 text-green-700 border-green-200' },
  todo: { icon: '📌', label: '後でやる', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  reply: { icon: '↩️', label: '返信', color: 'bg-slate-50 text-slate-700 border-slate-200' },
  other: { icon: '📋', label: 'その他', color: 'bg-slate-50 text-slate-700 border-slate-200' },
};

// ステータス設定
const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  pending: { label: '未着手', color: 'text-gray-500', dot: 'bg-gray-400' },
  approved: { label: '承認済み', color: 'text-blue-600', dot: 'bg-blue-500' },
  executing: { label: '実行中', color: 'text-yellow-600', dot: 'bg-yellow-500' },
  consulting: { label: '相談中', color: 'text-purple-600', dot: 'bg-purple-500' },
  draft_ready: { label: '回答あり', color: 'text-indigo-600', dot: 'bg-indigo-500' },
  done: { label: '完了', color: 'text-green-600', dot: 'bg-green-500' },
  failed: { label: '失敗', color: 'text-red-600', dot: 'bg-red-500' },
};

// 相談データ型
interface Consultation {
  id: string;
  job_id: string;
  requester_user_id: string;
  responder_user_id: string;
  question: string;
  answer?: string;
  thread_summary?: string;
  status: string;
  created_at: string;
  answered_at?: string;
  jobs?: { title: string; description?: string; source_message_id?: string; source_channel?: string };
}

type MainTab = 'active' | 'completed';
type ActiveFilter = 'all' | 'schedule' | 'consult' | 'todo' | 'reply';
type CompletedFilter = 'all' | 'schedule' | 'consult' | 'todo' | 'reply' | 'other';

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>('active');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [completedFilter, setCompletedFilter] = useState<CompletedFilter>('all');
  const [completedSearch, setCompletedSearch] = useState('');
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [consultAnswer, setConsultAnswer] = useState<Record<string, string>>({});
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [editedDrafts, setEditedDrafts] = useState<Record<string, string>>({});
  const [showConsultTab, setShowConsultTab] = useState(false);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs');
      const json = await res.json();
      if (json.success) {
        setJobs(json.data || []);
      }
    } catch (e) {
      console.error('ジョブ取得エラー:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchConsultations = useCallback(async () => {
    try {
      const res = await fetch('/api/consultations?role=responder&status=pending');
      const json = await res.json();
      if (json.success) {
        setConsultations(json.data || []);
      }
    } catch (e) {
      console.error('相談取得エラー:', e);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchConsultations();
  }, [fetchJobs, fetchConsultations]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), description: newDescription.trim() || undefined, type: 'todo' }),
      });
      const json = await res.json();
      if (json.success) {
        setJobs(prev => [json.data, ...prev]);
        setNewTitle('');
        setNewDescription('');
        setShowForm(false);
      }
    } catch (e) {
      console.error('ジョブ作成エラー:', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (job: Job) => {
    const newStatus = job.status === 'done' ? 'pending' : 'done';
    try {
      const res = await fetch('/api/jobs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: job.id, status: newStatus }),
      });
      const json = await res.json();
      if (json.success) {
        setJobs(prev => prev.map(j => j.id === job.id ? json.data : j));
      }
    } catch (e) {
      console.error('ジョブ更新エラー:', e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/jobs?id=${id}`, { method: 'DELETE' });
      setJobs(prev => prev.filter(j => j.id !== id));
    } catch (e) {
      console.error('ジョブ削除エラー:', e);
    }
  };

  const handleExecute = async (job: Job) => {
    setExecutingId(job.id);
    try {
      const draft = editedDrafts[job.id] || job.aiDraft || '';
      const res = await fetch(`/api/jobs/${job.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editedDraft: draft }),
      });
      const json = await res.json();
      if (json.success) {
        await fetchJobs();
      } else {
        alert(`実行失敗: ${json.error || '不明なエラー'}`);
      }
    } catch (e) {
      console.error('ジョブ実行エラー:', e);
      alert('ジョブの実行に失敗しました');
    } finally {
      setExecutingId(null);
    }
  };

  const handleAnswerConsultation = async (consultation: Consultation) => {
    const answer = consultAnswer[consultation.id];
    if (!answer?.trim()) return;
    setAnsweringId(consultation.id);
    try {
      const res = await fetch('/api/consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultationId: consultation.id, answer: answer.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setConsultations(prev => prev.filter(c => c.id !== consultation.id));
        setConsultAnswer(prev => {
          const next = { ...prev };
          delete next[consultation.id];
          return next;
        });
        await fetchJobs();
      }
    } catch (e) {
      console.error('回答エラー:', e);
    } finally {
      setAnsweringId(null);
    }
  };

  const handleApprove = async (job: Job) => {
    try {
      const res = await fetch('/api/jobs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: job.id, status: 'approved' }),
      });
      const json = await res.json();
      if (json.success) {
        setJobs(prev => prev.map(j => j.id === job.id ? json.data : j));
      }
    } catch (e) {
      console.error('承認エラー:', e);
    }
  };

  // ジョブ分類
  const activeJobs = useMemo(() => jobs.filter(j => !['done', 'failed'].includes(j.status)), [jobs]);
  const completedJobs = useMemo(() => jobs.filter(j => j.status === 'done' || j.status === 'failed'), [jobs]);

  // 進行中フィルタリング
  const filteredActiveJobs = useMemo(() => {
    if (activeFilter === 'all') return activeJobs;
    return activeJobs.filter(j => j.type === activeFilter);
  }, [activeJobs, activeFilter]);

  // 完了フィルタリング + 検索
  const filteredCompletedJobs = useMemo(() => {
    let result = completedJobs;

    // タイプフィルタ
    if (completedFilter !== 'all') {
      result = result.filter(j => j.type === completedFilter);
    }

    // キーワード検索
    if (completedSearch.trim()) {
      const q = completedSearch.toLowerCase();
      result = result.filter(j =>
        j.title.toLowerCase().includes(q) ||
        (j.description && j.description.toLowerCase().includes(q)) ||
        (j.targetName && j.targetName.toLowerCase().includes(q))
      );
    }

    return result;
  }, [completedJobs, completedFilter, completedSearch]);

  const consultingCount = activeJobs.filter(j => j.status === 'consulting').length;
  const draftReadyCount = activeJobs.filter(j => j.status === 'draft_ready').length;

  return (
    <AppLayout>
      <ContextBar title="ジョブ" subtitle="AIに委ねる日常の簡易作業" />

      <div className="p-4 max-w-3xl mx-auto">
        {/* 相談受信バナー */}
        {consultations.length > 0 && (
          <div className="mb-4">
            <button
              onClick={() => setShowConsultTab(!showConsultTab)}
              className="w-full flex items-center gap-2 px-4 py-3 bg-purple-50 border border-purple-200 rounded-xl hover:bg-purple-100 transition-colors"
            >
              <MessageSquare className="w-5 h-5 text-purple-600" />
              <span className="text-sm font-medium text-purple-700">
                あなた宛ての相談が {consultations.length} 件あります
              </span>
              {showConsultTab
                ? <ChevronUp className="w-4 h-4 text-purple-500 ml-auto" />
                : <ChevronDown className="w-4 h-4 text-purple-500 ml-auto" />
              }
            </button>
            {showConsultTab && (
              <div className="mt-2 space-y-3">
                {consultations.map(c => (
                  <div key={c.id} className="bg-white border border-purple-100 rounded-xl p-4 shadow-sm">
                    <div className="text-xs text-purple-500 mb-1">
                      {c.jobs?.title || '社内相談'}
                    </div>
                    {c.thread_summary && (
                      <div className="text-xs text-gray-400 mb-2 p-2 bg-gray-50 rounded">
                        <span className="font-medium text-gray-500">スレッド要約: </span>
                        {c.thread_summary.slice(0, 200)}
                      </div>
                    )}
                    <div className="text-sm text-gray-700 mb-3 whitespace-pre-wrap">
                      <span className="font-medium">質問: </span>{c.question}
                    </div>
                    <textarea
                      value={consultAnswer[c.id] || ''}
                      onChange={e => setConsultAnswer(prev => ({ ...prev, [c.id]: e.target.value }))}
                      placeholder="回答を入力してください..."
                      className="w-full px-3 py-2 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-purple-300 focus:border-purple-400"
                      rows={3}
                    />
                    <div className="flex justify-end mt-2">
                      <Button
                        onClick={() => handleAnswerConsultation(c)}
                        variant="primary"
                        size="sm"
                        disabled={!consultAnswer[c.id]?.trim() || answeringId === c.id}
                      >
                        {answeringId === c.id ? '送信中...' : '回答を送信'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* メインタブ: 進行中 / 完了 */}
        <div className="flex items-center border-b border-gray-200 mb-4">
          <button
            onClick={() => setMainTab('active')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              mainTab === 'active'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            進行中
            {activeJobs.length > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                mainTab === 'active' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
              }`}>
                {activeJobs.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setMainTab('completed')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              mainTab === 'completed'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            完了
            {completedJobs.length > 0 && (
              <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                mainTab === 'completed' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'
              }`}>
                {completedJobs.length}
              </span>
            )}
          </button>
        </div>

        {/* ===== 進行中タブ ===== */}
        {mainTab === 'active' && (
          <>
            {/* 統計 */}
            <div className="flex gap-4 mb-3 text-sm">
              <span className="text-gray-500">進行中: <span className="font-medium text-gray-800">{activeJobs.length}</span></span>
              {consultingCount > 0 && (
                <span className="text-purple-500">相談中: <span className="font-medium">{consultingCount}</span></span>
              )}
              {draftReadyCount > 0 && (
                <span className="text-indigo-500">回答あり: <span className="font-medium">{draftReadyCount}</span></span>
              )}
            </div>

            {/* フィルター + 新規ボタン */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <div className="flex gap-1 flex-wrap">
                {([
                  { key: 'all', label: 'すべて' },
                  { key: 'schedule', label: '📅 日程調整' },
                  { key: 'consult', label: '💬 相談' },
                  { key: 'todo', label: '📌 ToDo' },
                  { key: 'reply', label: '↩️ 返信' },
                ] as { key: ActiveFilter; label: string }[]).map(f => (
                  <button
                    key={f.key}
                    onClick={() => setActiveFilter(f.key)}
                    className={`px-3 py-1 text-xs rounded-full transition-colors ${
                      activeFilter === f.key
                        ? 'bg-blue-100 text-blue-700 font-medium'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex-1" />
              <Button onClick={() => setShowForm(!showForm)} variant="primary" size="sm">
                <Plus className="w-4 h-4 mr-1" />
                新規
              </Button>
            </div>

            {/* 新規作成フォーム */}
            {showForm && (
              <div className="bg-white border rounded-xl p-4 mb-4 shadow-sm">
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="やることを入力（例: ○○さんに日程返信）"
                  className="w-full px-3 py-2 border rounded-lg mb-2 text-sm"
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
                <textarea
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  placeholder="詳細（任意）"
                  className="w-full px-3 py-2 border rounded-lg mb-2 text-sm resize-none"
                  rows={2}
                />
                <div className="flex gap-2 justify-end">
                  <Button onClick={() => setShowForm(false)} variant="secondary" size="sm">キャンセル</Button>
                  <Button onClick={handleCreate} variant="primary" size="sm" disabled={isSubmitting || !newTitle.trim()}>
                    {isSubmitting ? '作成中...' : '作成'}
                  </Button>
                </div>
              </div>
            )}

            {/* 進行中ジョブ一覧 */}
            {isLoading ? (
              <div className="text-center text-gray-400 py-8">読み込み中...</div>
            ) : filteredActiveJobs.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                {activeFilter === 'all' ? '進行中のジョブはありません' : '該当するジョブがありません'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredActiveJobs.map(job => (
                  <ActiveJobCard
                    key={job.id}
                    job={job}
                    isExpanded={expandedJob === job.id}
                    onToggleExpand={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                    onToggleStatus={() => handleToggleStatus(job)}
                    onDelete={() => handleDelete(job.id)}
                    onApprove={() => handleApprove(job)}
                    onExecute={() => handleExecute(job)}
                    isExecuting={executingId === job.id}
                    editedDraft={editedDrafts[job.id]}
                    onDraftChange={v => setEditedDrafts(prev => ({ ...prev, [job.id]: v }))}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ===== 完了アーカイブタブ ===== */}
        {mainTab === 'completed' && (
          <>
            {/* 検索 + フィルタ */}
            <div className="space-y-3 mb-4">
              {/* 検索バー */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={completedSearch}
                  onChange={e => setCompletedSearch(e.target.value)}
                  placeholder="タイトル・説明・宛先で検索..."
                  className="w-full pl-9 pr-8 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-green-200 focus:border-green-400"
                />
                {completedSearch && (
                  <button
                    onClick={() => setCompletedSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* タイプフィルタ */}
              <div className="flex gap-1 flex-wrap">
                {([
                  { key: 'all', label: 'すべて' },
                  { key: 'schedule', label: '📅 日程調整' },
                  { key: 'consult', label: '💬 相談' },
                  { key: 'todo', label: '📌 ToDo' },
                  { key: 'reply', label: '↩️ 返信' },
                  { key: 'other', label: '📋 その他' },
                ] as { key: CompletedFilter; label: string }[]).map(f => (
                  <button
                    key={f.key}
                    onClick={() => setCompletedFilter(f.key)}
                    className={`px-3 py-1 text-xs rounded-full transition-colors ${
                      completedFilter === f.key
                        ? 'bg-green-100 text-green-700 font-medium'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 件数表示 */}
            <div className="text-xs text-gray-400 mb-3">
              {filteredCompletedJobs.length} 件
              {(completedFilter !== 'all' || completedSearch) && ` / 全 ${completedJobs.length} 件`}
            </div>

            {/* 完了ジョブ一覧 */}
            {isLoading ? (
              <div className="text-center text-gray-400 py-8">読み込み中...</div>
            ) : filteredCompletedJobs.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                {completedJobs.length === 0 ? '完了したジョブはまだありません' : '該当するジョブが見つかりません'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredCompletedJobs.map(job => (
                  <CompletedJobCard
                    key={job.id}
                    job={job}
                    isExpanded={expandedJob === job.id}
                    onToggleExpand={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                    onRestore={() => handleToggleStatus(job)}
                    onDelete={() => handleDelete(job.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

// ===== 進行中ジョブカード =====
function ActiveJobCard({
  job, isExpanded, onToggleExpand, onToggleStatus, onDelete,
  onApprove, onExecute, isExecuting, editedDraft, onDraftChange,
}: {
  job: Job;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  onApprove: () => void;
  onExecute: () => void;
  isExecuting: boolean;
  editedDraft?: string;
  onDraftChange: (v: string) => void;
}) {
  const typeConf = JOB_TYPE_CONFIG[job.type || 'other'] || JOB_TYPE_CONFIG.other;
  const statusConf = STATUS_CONFIG[job.status] || STATUS_CONFIG.pending;
  const hasDraft = !!job.aiDraft;
  const needsAction = job.status === 'draft_ready' || (job.status === 'pending' && hasDraft);

  return (
    <div className={`bg-white border rounded-xl transition-shadow ${
      needsAction ? 'border-indigo-200 shadow-sm' : 'hover:shadow-sm'
    }`}>
      {/* メイン行 */}
      <div className="flex items-center gap-3 p-3">
        <button
          onClick={onToggleStatus}
          className="flex-shrink-0 w-5 h-5 rounded border-2 border-gray-300 hover:border-blue-400 flex items-center justify-center transition-colors"
        />

        <span className={`flex-shrink-0 px-2 py-0.5 text-[10px] rounded-full border ${typeConf.color}`}>
          {typeConf.icon} {typeConf.label}
        </span>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-800">{job.title}</div>
          {job.description && (
            <div className="text-xs text-gray-400 truncate">{job.description}</div>
          )}
        </div>

        <div className={`flex items-center gap-1.5 text-xs ${statusConf.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${statusConf.dot}`} />
          {statusConf.label}
        </div>

        {job.dueDate && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Calendar className="w-3 h-3" />
            {new Date(job.dueDate).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
          </div>
        )}

        {(hasDraft || job.type === 'consult' || job.type === 'schedule') && (
          <button onClick={onToggleExpand} className="text-gray-400 hover:text-gray-600">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}

        <button onClick={onDelete} className="text-gray-300 hover:text-red-500 transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* 展開エリア */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3">
          {job.type === 'schedule' && (
            <ScheduleDetail
              job={job}
              editedDraft={editedDraft}
              onDraftChange={onDraftChange}
              onApprove={onApprove}
              onExecute={onExecute}
              isExecuting={isExecuting}
            />
          )}

          {job.type === 'consult' && (
            <ConsultDetail
              job={job}
              editedDraft={editedDraft}
              onDraftChange={onDraftChange}
              onApprove={onApprove}
              onExecute={onExecute}
              isExecuting={isExecuting}
            />
          )}

          {job.type !== 'schedule' && job.type !== 'consult' && hasDraft && (
            <div>
              <p className="text-xs text-gray-400 mb-1">AI下書き</p>
              <textarea
                value={editedDraft ?? job.aiDraft ?? ''}
                onChange={e => onDraftChange(e.target.value)}
                className="w-full text-sm p-2 border rounded-lg resize-none bg-gray-50"
                rows={4}
              />
              <div className="flex gap-2 mt-2 justify-end">
                {job.status === 'pending' && (
                  <Button onClick={onApprove} variant="secondary" size="sm">承認</Button>
                )}
                <Button onClick={onExecute} variant="primary" size="sm" disabled={isExecuting}>
                  <Send className="w-3 h-3 mr-1" />
                  {isExecuting ? '実行中...' : '送信実行'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ===== 完了ジョブカード =====
function CompletedJobCard({
  job, isExpanded, onToggleExpand, onRestore, onDelete,
}: {
  job: Job;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const typeConf = JOB_TYPE_CONFIG[job.type || 'other'] || JOB_TYPE_CONFIG.other;
  const isFailed = job.status === 'failed';
  const completedDate = job.completedAt
    ? new Date(job.completedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })
    : job.executedAt
    ? new Date(job.executedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;
  const createdDate = new Date(job.createdAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });

  const executionLog = (job as Record<string, unknown>).executionLog as string | undefined;

  return (
    <div className={`bg-white border rounded-xl transition-shadow ${isFailed ? 'border-red-100' : 'border-gray-100'}`}>
      <div className="flex items-center gap-3 p-3">
        {/* 完了チェック */}
        <div className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center ${
          isFailed ? 'bg-red-500 border-2 border-red-500' : 'bg-green-500 border-2 border-green-500'
        }`}>
          {isFailed
            ? <X className="w-3 h-3 text-white" />
            : <Check className="w-3 h-3 text-white" />
          }
        </div>

        {/* タイプバッジ */}
        <span className={`flex-shrink-0 px-2 py-0.5 text-[10px] rounded-full border ${typeConf.color}`}>
          {typeConf.icon} {typeConf.label}
        </span>

        {/* タイトル */}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-gray-600">{job.title}</div>
          {job.targetName && (
            <div className="text-xs text-gray-400">宛先: {job.targetName}</div>
          )}
        </div>

        {/* 日付 */}
        <div className="text-xs text-gray-400 flex-shrink-0">
          {completedDate || createdDate}
        </div>

        {/* 展開/詳細 */}
        <button onClick={onToggleExpand} className="text-gray-400 hover:text-gray-600">
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* 展開: 詳細情報 */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-3">
          {/* 基本情報 */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-400">作成日:</span>{' '}
              <span className="text-gray-600">{new Date(job.createdAt).toLocaleDateString('ja-JP')}</span>
            </div>
            {completedDate && (
              <div>
                <span className="text-gray-400">完了日:</span>{' '}
                <span className="text-gray-600">{completedDate}</span>
              </div>
            )}
            {job.targetName && (
              <div>
                <span className="text-gray-400">宛先:</span>{' '}
                <span className="text-gray-600">{job.targetName}</span>
              </div>
            )}
            {job.sourceChannel && (
              <div>
                <span className="text-gray-400">チャネル:</span>{' '}
                <span className="text-gray-600">{job.sourceChannel}</span>
              </div>
            )}
          </div>

          {/* 説明 */}
          {job.description && (
            <div>
              <p className="text-xs text-gray-400 mb-1">説明</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{job.description}</p>
            </div>
          )}

          {/* AI下書き */}
          {job.aiDraft && (
            <div>
              <p className="text-xs text-gray-400 mb-1">送信内容</p>
              <div className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg max-h-48 overflow-y-auto">
                {job.aiDraft}
              </div>
            </div>
          )}

          {/* 実行ログ */}
          {executionLog && (
            <div className={`p-2 rounded text-xs whitespace-pre-wrap ${
              isFailed ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
            }`}>
              {executionLog}
            </div>
          )}

          {/* アクション */}
          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={onRestore}
              className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
            >
              進行中に戻す
            </button>
            <button
              onClick={onDelete}
              className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors"
            >
              削除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== 日程調整 詳細コンポーネント =====
function ScheduleDetail({
  job, editedDraft, onDraftChange, onApprove, onExecute, isExecuting,
}: {
  job: Job;
  editedDraft?: string;
  onDraftChange: (v: string) => void;
  onApprove: () => void;
  onExecute: () => void;
  isExecuting: boolean;
}) {
  return (
    <div className="space-y-3">
      {job.aiDraft && (
        <div>
          <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            AI生成の返信文面（空き日程入り）
          </p>
          <textarea
            value={editedDraft ?? job.aiDraft}
            onChange={e => onDraftChange(e.target.value)}
            className="w-full text-sm p-3 border rounded-lg resize-none bg-blue-50/50"
            rows={8}
          />
        </div>
      )}

      {job.aiDraft && (
        <div className="flex gap-2 justify-end">
          {job.status === 'pending' && (
            <Button onClick={onApprove} variant="secondary" size="sm">承認のみ</Button>
          )}
          <Button onClick={onExecute} variant="primary" size="sm" disabled={isExecuting}>
            <Send className="w-3 h-3 mr-1" />
            {isExecuting ? '送信中...' : '承認して送信'}
          </Button>
        </div>
      )}
    </div>
  );
}

// ===== 社内相談 詳細コンポーネント =====
function ConsultDetail({
  job, editedDraft, onDraftChange, onApprove, onExecute, isExecuting,
}: {
  job: Job;
  editedDraft?: string;
  onDraftChange: (v: string) => void;
  onApprove: () => void;
  onExecute: () => void;
  isExecuting: boolean;
}) {
  const isDone = job.status === 'done' || job.status === 'failed';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <StepBadge label="相談送信" active={true} done={true} />
        <span className="text-gray-300">→</span>
        <StepBadge label="回答待ち" active={job.status === 'consulting'} done={job.status === 'draft_ready' || isDone} />
        <span className="text-gray-300">→</span>
        <StepBadge label="返信下書き" active={job.status === 'draft_ready'} done={isDone} />
        <span className="text-gray-300">→</span>
        <StepBadge label="送信完了" active={false} done={isDone && job.status === 'done'} />
      </div>

      {job.status === 'consulting' && (
        <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg">
          <Clock className="w-4 h-4 text-purple-500 animate-pulse" />
          <span className="text-sm text-purple-700">相手からの回答を待っています...</span>
        </div>
      )}

      {job.status === 'draft_ready' && job.aiDraft && (
        <div>
          <div className="flex items-center gap-2 mb-2 p-2 bg-indigo-50 rounded-lg">
            <AlertCircle className="w-4 h-4 text-indigo-500" />
            <span className="text-xs text-indigo-700">社内から回答が届きました。返信文面を確認してください。</span>
          </div>
          <p className="text-xs text-gray-400 mb-1">AI生成の返信文面（相談結果反映済み）</p>
          <textarea
            value={editedDraft ?? job.aiDraft}
            onChange={e => onDraftChange(e.target.value)}
            className="w-full text-sm p-3 border rounded-lg resize-none bg-indigo-50/50"
            rows={6}
          />
          <div className="flex gap-2 justify-end mt-2">
            <Button onClick={onApprove} variant="secondary" size="sm">承認のみ</Button>
            <Button onClick={onExecute} variant="primary" size="sm" disabled={isExecuting}>
              <Send className="w-3 h-3 mr-1" />
              {isExecuting ? '送信中...' : '承認して送信'}
            </Button>
          </div>
        </div>
      )}

      {isDone && (
        <div className="flex items-center gap-2 text-xs text-green-600">
          <Check className="w-4 h-4" />
          返信送信完了
        </div>
      )}
    </div>
  );
}

// ===== ステップバッジ =====
function StepBadge({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
      done ? 'bg-green-100 text-green-700' :
      active ? 'bg-purple-100 text-purple-700' :
      'bg-gray-100 text-gray-400'
    }`}>
      {done ? '✓ ' : ''}{label}
    </span>
  );
}
