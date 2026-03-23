// V2-D: 会議録一覧コンポーネント（日付降順、要約表示、プロジェクト変更対応）
'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, Calendar, ChevronDown, ChevronRight, Trash2, CheckCircle2, Clock, RefreshCw, AlertCircle, ArrowRightLeft } from 'lucide-react';

interface MeetingRecord {
  id: string;
  project_id: string;
  title: string;
  meeting_date: string;
  content: string;
  ai_summary: string | null;
  processed: boolean;
  source_type: string;
  created_at: string;
}

interface ProjectOption {
  id: string;
  name: string;
  org_name?: string;
}

interface MeetingRecordListProps {
  projectId: string;
  refreshKey?: number; // 親から更新トリガーを受け取る
  onAnalyzed?: () => void; // 再解析完了時のコールバック
}

export default function MeetingRecordList({ projectId, refreshKey, onAnalyzed }: MeetingRecordListProps) {
  const [records, setRecords] = useState<MeetingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reanalyzingId, setReanalyzingId] = useState<string | null>(null);
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null);
  // プロジェクト変更UI
  const [reassigningId, setReassigningId] = useState<string | null>(null);
  const [allProjects, setAllProjects] = useState<ProjectOption[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  const fetchRecords = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/meeting-records?project_id=${projectId}`);
      const data = await res.json();
      if (data.success) {
        setRecords(data.data || []);
      }
    } catch (err) {
      console.error('[MeetingRecordList] 取得エラー:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords, refreshKey]);

  const handleReanalyze = async (id: string) => {
    setReanalyzingId(id);
    setReanalyzeError(null);
    try {
      // AI解析 + 検討ツリー生成 + チャネル通知を一括実行
      const analyzeRes = await fetch(`/api/meeting-records/${id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const analyzeData = await analyzeRes.json();

      if (!analyzeData.success) {
        setReanalyzeError(analyzeData.error || '解析に失敗しました');
        return;
      }

      const treeResult = analyzeData.data?.tree_generated;
      console.log('[再解析] 完了:', {
        topics: analyzeData.data?.analysis?.topics?.length || 0,
        tree: treeResult,
      });

      // リスト更新
      await fetchRecords();
      // 親に通知（タスク提案パネル・検討ツリー表示のリフレッシュ用）
      onAnalyzed?.();
    } catch (err) {
      console.error('[MeetingRecordList] 再解析エラー:', err);
      setReanalyzeError('再解析中にエラーが発生しました');
    } finally {
      setReanalyzingId(null);
    }
  };

  // プロジェクト一覧取得（変更ドロップダウン用）
  const fetchProjects = useCallback(async () => {
    if (projectsLoaded && allProjects.length > 0) return;
    try {
      // プロジェクト一覧を直接取得（組織名付き）
      const res = await fetch('/api/projects/list-all');
      const data = await res.json();
      if (data.success && data.data) {
        const options: ProjectOption[] = data.data.map((p: { id: string; name: string; org_name?: string }) => ({
          id: p.id,
          name: p.name,
          org_name: p.org_name || '',
        }));
        setAllProjects(options);
        setProjectsLoaded(true);
      } else {
        console.error('[MeetingRecordList] プロジェクト一覧取得失敗:', data.error);
      }
    } catch (err) {
      console.error('[MeetingRecordList] プロジェクト一覧取得エラー:', err);
    }
  }, [projectsLoaded, allProjects.length]);

  // プロジェクト変更実行（移動先で再解析も実行）
  const handleReassign = async (recordId: string, newProjectId: string) => {
    if (newProjectId === projectId) {
      setReassigningId(null);
      return;
    }
    const targetName = allProjects.find(p => p.id === newProjectId);
    if (!confirm(`この議事録を「${targetName?.org_name ? targetName.org_name + ' / ' : ''}${targetName?.name || ''}」に移動しますか？`)) {
      return;
    }
    try {
      // 1. プロジェクトを変更
      console.log('[MeetingRecordList] プロジェクト変更開始:', { recordId, newProjectId });
      const res = await fetch(`/api/meeting-records/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: newProjectId }),
      });
      const data = await res.json();
      console.log('[MeetingRecordList] PUT結果:', data);
      if (data.success) {
        // 2. 移動先で再解析を実行（検討ツリー再生成 + チャネル通知）
        try {
          console.log('[MeetingRecordList] 移動先で再解析開始...');
          await fetch(`/api/meeting-records/${recordId}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          console.log('[MeetingRecordList] 再解析完了');
        } catch (e) {
          console.error('[MeetingRecordList] 移動先再解析エラー:', e);
        }
        // 3. 移動したのでリストから除外
        setRecords(prev => prev.filter(r => r.id !== recordId));
        setReassigningId(null);
        // 4. 親に通知（検討ツリー表示のリフレッシュ用）
        onAnalyzed?.();
        alert('議事録を移動しました。移動先で検討ツリーが再生成されます。');
      } else {
        console.error('[MeetingRecordList] 移動失敗:', data.error);
        alert(`移動に失敗しました: ${data.error || '不明なエラー'}`);
      }
    } catch (err) {
      console.error('[MeetingRecordList] 移動エラー:', err);
      alert('移動中にエラーが発生しました');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('この会議録を削除しますか？')) return;

    try {
      const res = await fetch(`/api/meeting-records/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setRecords(prev => prev.filter(r => r.id !== id));
        if (expandedId === id) setExpandedId(null);
      }
    } catch (err) {
      console.error('[MeetingRecordList] 削除エラー:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin text-2xl">&#8987;</div>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-slate-400">
        <div className="text-center">
          <FileText className="w-6 h-6 mx-auto mb-1.5 text-slate-300" />
          <p className="text-xs">会議録がまだありません</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
        会議録一覧（{records.length}件）
      </h3>
      {records.map((record) => {
        const isExpanded = expandedId === record.id;
        return (
          <div
            key={record.id}
            className="bg-white border border-slate-200 rounded-lg overflow-hidden"
          >
            {/* ヘッダー行 */}
            <div
              className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : record.id)}
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
              <Calendar className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span className="text-xs text-slate-400 shrink-0">
                {new Date(record.meeting_date).toLocaleDateString('ja-JP', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
              <span className="text-sm text-slate-700 font-medium flex-1 truncate">
                {record.title}
              </span>
              {record.processed ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" title="AI解析済み" />
              ) : (
                <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" title="未解析" />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleReanalyze(record.id);
                }}
                disabled={reanalyzingId === record.id}
                className="p-1 text-slate-300 hover:text-blue-500 transition-colors shrink-0 disabled:opacity-50"
                title={record.processed ? '再解析' : 'AI解析を実行'}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${reanalyzingId === record.id ? 'animate-spin text-blue-500' : ''}`} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (reassigningId === record.id) {
                    setReassigningId(null);
                  } else {
                    setReassigningId(record.id);
                    fetchProjects();
                  }
                }}
                className={`p-1 transition-colors shrink-0 ${reassigningId === record.id ? 'text-blue-500' : 'text-slate-300 hover:text-blue-500'}`}
                title="プロジェクトを変更"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(record.id);
                }}
                className="p-1 text-slate-300 hover:text-red-500 transition-colors shrink-0"
                title="削除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* プロジェクト変更ドロップダウン */}
            {reassigningId === record.id && (
              <div className="px-4 py-2 bg-blue-50 border-t border-blue-100" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-blue-600 font-medium shrink-0">移動先:</span>
                  <select
                    className="flex-1 text-xs border border-blue-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) handleReassign(record.id, e.target.value);
                    }}
                  >
                    <option value="" disabled>プロジェクトを選択...</option>
                    {allProjects
                      .filter(p => p.id !== projectId)
                      .map(p => (
                        <option key={p.id} value={p.id}>
                          {p.org_name ? `${p.org_name} / ` : ''}{p.name}
                        </option>
                      ))}
                  </select>
                  <button
                    onClick={() => setReassigningId(null)}
                    className="text-[10px] text-slate-400 hover:text-slate-600"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            )}

            {/* 展開コンテンツ */}
            {isExpanded && (
              <div className="px-4 pb-4 border-t border-slate-100">
                {/* 解析ステータス */}
                {!record.processed && !reanalyzingId && (
                  <div className="mt-3 mb-3 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="text-xs text-amber-700">AI解析がまだ完了していません。</span>
                    <button
                      onClick={() => handleReanalyze(record.id)}
                      className="ml-auto text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      解析を実行
                    </button>
                  </div>
                )}
                {reanalyzingId === record.id && (
                  <div className="mt-3 mb-3 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />
                    <span className="text-xs text-blue-700">AI解析中...（数十秒かかる場合があります）</span>
                  </div>
                )}
                {reanalyzeError && expandedId === record.id && (
                  <div className="mt-3 mb-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <span className="text-xs text-red-700">{reanalyzeError}</span>
                  </div>
                )}
                {/* AI要約 */}
                {record.ai_summary && (
                  <div className="mt-3 mb-3">
                    <p className="text-[10px] font-semibold text-blue-600 mb-1">AI要約</p>
                    <p className="text-xs text-slate-600 leading-relaxed bg-blue-50 border border-blue-100 rounded-lg p-3">
                      {record.ai_summary}
                    </p>
                  </div>
                )}
                {/* 原文（折りたたみ） */}
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 mb-1">会議内容</p>
                  <pre className="text-xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-100 rounded-lg p-3 whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {record.content}
                  </pre>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
