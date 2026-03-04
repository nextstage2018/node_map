// Phase 58: ジョブページ改善 — 4タイプ別UI + 相談回答 + 日程調整承認
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Job } from '@/lib/types';
import AppLayout from '@/components/shared/AppLayout';
import ContextBar from '@/components/shared/ContextBar';
import Button from '@/components/ui/Button';
import {
  Plus, Check, Trash2, Calendar, ChevronDown, ChevronUp,
  Send, MessageSquare, FolderOpen, Clock, AlertCircle,
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

type FilterType = 'all' | 'active' | 'schedule' | 'consult' | 'todo' | 'done';

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
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

  // ジョブ実行（送信）
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

  // 相談に回答
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

  // ジョブ承認
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

  // フィルタリング
  const filteredJobs = jobs.filter(j => {
    switch (filter) {
      case 'active': return !['done', 'failed'].includes(j.status);
      case 'schedule': return j.type === 'schedule';
      case 'consult': return j.type === 'consult';
      case 'todo': return j.type === 'todo';
      case 'done': return j.status === 'done' || j.status === 'failed';
      default: return true;
    }
  });

  const activeCount = jobs.filter(j => !['done', 'failed'].includes(j.status)).length;
  const consultingCount = jobs.filter(j => j.status === 'consulting').length;
  const draftReadyCount = jobs.filter(j => j.status === 'draft_ready').length;

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

        {/* 統計 */}
        <div className="flex gap-4 mb-4 text-sm">
          <span className="text-gray-500">進行中: <span className="font-medium text-gray-800">{activeCount}</span></span>
          {consultingCount > 0 && (
            <span className="text-purple-500">相談中: <span className="font-medium">{consultingCount}</span></span>
          )}
          {draftReadyCount > 0 && (
            <span className="text-indigo-500">回答あり: <span className="font-medium">{draftReadyCount}</span></span>
          )}
          <span className="text-gray-400">完了: {jobs.filter(j => j.status === 'done').length}</span>
        </div>

        {/* フィルター + 新規ボタン */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="flex gap-1 flex-wrap">
            {([
              { key: 'all', label: 'すべて' },
              { key: 'active', label: '進行中' },
              { key: 'schedule', label: '📅 日程調整' },
              { key: 'consult', label: '💬 相談' },
              { key: 'todo', label: '📌 ToDo' },
              { key: 'done', label: '完了' },
            ] as { key: FilterType; label: string }[]).map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  filter === f.key
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

        {/* ジョブ一覧 */}
        {isLoading ? (
          <div className="text-center text-gray-400 py-8">読み込み中...</div>
        ) : filteredJobs.length === 0 ? (
          <div className="text-center text-gray-400 py-8">ジョブがありません</div>
        ) : (
          <div className="space-y-2">
            {filteredJobs.map(job => {
              const typeConf = JOB_TYPE_CONFIG[job.type || 'other'] || JOB_TYPE_CONFIG.other;
              const statusConf = STATUS_CONFIG[job.status] || STATUS_CONFIG.pending;
              const isExpanded = expandedJob === job.id;
              const isDone = job.status === 'done' || job.status === 'failed';
              const hasDraft = !!job.aiDraft;
              const needsAction = job.status === 'draft_ready' || (job.status === 'pending' && hasDraft);

              return (
                <div
                  key={job.id}
                  className={`bg-white border rounded-xl transition-shadow ${
                    needsAction ? 'border-indigo-200 shadow-sm' : isDone ? 'opacity-60' : 'hover:shadow-sm'
                  }`}
                >
                  {/* メイン行 */}
                  <div className="flex items-center gap-3 p-3">
                    {/* チェックボックス */}
                    <button
                      onClick={() => handleToggleStatus(job)}
                      className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        isDone
                          ? 'bg-green-500 border-green-500 text-white'
                          : 'border-gray-300 hover:border-blue-400'
                      }`}
                    >
                      {isDone && <Check className="w-3 h-3" />}
                    </button>

                    {/* タイプバッジ */}
                    <span className={`flex-shrink-0 px-2 py-0.5 text-[10px] rounded-full border ${typeConf.color}`}>
                      {typeConf.icon} {typeConf.label}
                    </span>

                    {/* タイトル・説明 */}
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${isDone ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                        {job.title}
                      </div>
                      {job.description && (
                        <div className="text-xs text-gray-400 truncate">{job.description}</div>
                      )}
                    </div>

                    {/* ステータス */}
                    <div className={`flex items-center gap-1.5 text-xs ${statusConf.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusConf.dot}`} />
                      {statusConf.label}
                    </div>

                    {/* 期限 */}
                    {job.dueDate && (
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Calendar className="w-3 h-3" />
                        {new Date(job.dueDate).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                      </div>
                    )}

                    {/* 展開ボタン */}
                    {(hasDraft || job.type === 'consult' || job.type === 'schedule') && (
                      <button
                        onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    )}

                    {/* 削除 */}
                    <button
                      onClick={() => handleDelete(job.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* 展開エリア */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                      {/* 日程調整: 空き時間 + AI下書き */}
                      {job.type === 'schedule' && (
                        <ScheduleDetail
                          job={job}
                          editedDraft={editedDrafts[job.id]}
                          onDraftChange={v => setEditedDrafts(prev => ({ ...prev, [job.id]: v }))}
                          onApprove={() => handleApprove(job)}
                          onExecute={() => handleExecute(job)}
                          isExecuting={executingId === job.id}
                        />
                      )}

                      {/* 社内相談: 質問・要約・状態 */}
                      {job.type === 'consult' && (
                        <ConsultDetail
                          job={job}
                          editedDraft={editedDrafts[job.id]}
                          onDraftChange={v => setEditedDrafts(prev => ({ ...prev, [job.id]: v }))}
                          onApprove={() => handleApprove(job)}
                          onExecute={() => handleExecute(job)}
                          isExecuting={executingId === job.id}
                        />
                      )}

                      {/* その他: AI下書き表示 */}
                      {job.type !== 'schedule' && job.type !== 'consult' && hasDraft && (
                        <div>
                          <p className="text-xs text-gray-400 mb-1">AI下書き</p>
                          <textarea
                            value={editedDrafts[job.id] ?? job.aiDraft ?? ''}
                            onChange={e => setEditedDrafts(prev => ({ ...prev, [job.id]: e.target.value }))}
                            className="w-full text-sm p-2 border rounded-lg resize-none bg-gray-50"
                            rows={4}
                          />
                          {!isDone && (
                            <div className="flex gap-2 mt-2 justify-end">
                              {job.status === 'pending' && (
                                <Button onClick={() => handleApprove(job)} variant="secondary" size="sm">承認</Button>
                              )}
                              <Button
                                onClick={() => handleExecute(job)}
                                variant="primary"
                                size="sm"
                                disabled={executingId === job.id}
                              >
                                <Send className="w-3 h-3 mr-1" />
                                {executingId === job.id ? '実行中...' : '送信実行'}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 実行ログ */}
                      {job.status === 'done' && (job as Record<string, unknown>).executionLog && (
                        <div className="mt-2 p-2 bg-green-50 rounded text-xs text-green-700 whitespace-pre-wrap">
                          {String((job as Record<string, unknown>).executionLog)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
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
  const isDone = job.status === 'done' || job.status === 'failed';

  return (
    <div className="space-y-3">
      {/* AI返信文面 */}
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
            readOnly={isDone}
          />
        </div>
      )}

      {!isDone && job.aiDraft && (
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

      {isDone && (
        <div className="flex items-center gap-2 text-xs text-green-600">
          <Check className="w-4 h-4" />
          送信完了
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
      {/* ステータスフロー */}
      <div className="flex items-center gap-2 text-xs">
        <StepBadge label="相談送信" active={true} done={true} />
        <span className="text-gray-300">→</span>
        <StepBadge label="回答待ち" active={job.status === 'consulting'} done={job.status === 'draft_ready' || isDone} />
        <span className="text-gray-300">→</span>
        <StepBadge label="返信下書き" active={job.status === 'draft_ready'} done={isDone} />
        <span className="text-gray-300">→</span>
        <StepBadge label="送信完了" active={false} done={isDone && job.status === 'done'} />
      </div>

      {/* 相談中表示 */}
      {job.status === 'consulting' && (
        <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg">
          <Clock className="w-4 h-4 text-purple-500 animate-pulse" />
          <span className="text-sm text-purple-700">相手からの回答を待っています...</span>
        </div>
      )}

      {/* 回答あり → AI下書き表示 */}
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
