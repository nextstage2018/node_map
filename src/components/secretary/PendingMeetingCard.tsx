// 未確認議事録カード — ダッシュボード用
// プロジェクト判定が推定のみの議事録をユーザーに確認してもらう
'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, AlertTriangle, Check, Loader2, ChevronDown } from 'lucide-react';

interface PendingRecord {
  id: string;
  project_id: string;
  title: string;
  meeting_date: string;
  source_type: string;
  created_at: string;
  suggested_project: { name: string; org_name?: string } | null;
}

interface ProjectOption {
  id: string;
  name: string;
  org_name: string;
}

export default function PendingMeetingCard() {
  const [records, setRecords] = useState<PendingRecord[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<Record<string, string>>({});

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch('/api/meeting-records/pending');
      const data = await res.json();
      if (data.success) {
        setRecords(data.data.records || []);
        setProjects(data.data.projects || []);
        // 推定プロジェクトをデフォルト選択
        const defaults: Record<string, string> = {};
        for (const r of data.data.records || []) {
          if (r.project_id) defaults[r.id] = r.project_id;
        }
        setSelectedProjects(defaults);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  const handleConfirm = async (recordId: string) => {
    const projectId = selectedProjects[recordId];
    if (!projectId) return;

    setConfirmingId(recordId);
    try {
      const res = await fetch('/api/meeting-records/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record_id: recordId, project_id: projectId }),
      });
      const data = await res.json();
      if (data.success) {
        setRecords(prev => prev.filter(r => r.id !== recordId));
      }
    } catch { /* ignore */ }
    finally { setConfirmingId(null); }
  };

  // 件数0なら非表示
  if (!loading && records.length === 0) return null;

  return (
    <div className="bg-nm-surface rounded-xl border border-amber-200 shadow-sm flex flex-col">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-100 bg-amber-50 rounded-t-xl">
        <AlertTriangle className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-medium text-nm-text">未確認の議事録</span>
        {records.length > 0 && (
          <span className="ml-auto text-[10px] font-bold text-white bg-amber-500 rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
            {records.length}
          </span>
        )}
      </div>

      {/* コンテンツ */}
      <div className="px-4 py-3 flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-4 h-4 text-nm-text-muted animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[10px] text-nm-text-muted">
              プロジェクトの自動判定ができなかった議事録です。正しいプロジェクトを選択してください。
            </p>
            {records.map((record) => (
              <div key={record.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                {/* 会議情報 */}
                <div className="flex items-start gap-2">
                  <FileText className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-nm-text truncate">{record.title}</p>
                    <p className="text-[10px] text-nm-text-muted">
                      {new Date(record.meeting_date).toLocaleDateString('ja-JP', {
                        year: 'numeric', month: 'short', day: 'numeric',
                      })}
                    </p>
                  </div>
                </div>

                {/* 推定プロジェクト表示 */}
                {record.suggested_project && (
                  <p className="text-[10px] text-amber-600">
                    推定: {record.suggested_project.org_name ? `${record.suggested_project.org_name} / ` : ''}
                    {record.suggested_project.name}
                  </p>
                )}

                {/* プロジェクト選択 + 確定ボタン */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <select
                      value={selectedProjects[record.id] || ''}
                      onChange={(e) => setSelectedProjects(prev => ({ ...prev, [record.id]: e.target.value }))}
                      className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-nm-primary appearance-none pr-6"
                    >
                      <option value="" disabled>プロジェクトを選択...</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.org_name} / {p.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  <button
                    onClick={() => handleConfirm(record.id)}
                    disabled={!selectedProjects[record.id] || confirmingId === record.id}
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 bg-nm-primary text-white rounded text-xs font-medium hover:bg-nm-primary-hover disabled:opacity-50 transition-colors"
                  >
                    {confirmingId === record.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )}
                    <span>確定</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
