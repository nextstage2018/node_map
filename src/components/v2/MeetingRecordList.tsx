// V2-D: 会議録一覧コンポーネント（日付降順、要約表示）
'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, Calendar, ChevronDown, ChevronRight, Trash2, CheckCircle2, Clock, RefreshCw, AlertCircle } from 'lucide-react';

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
      // ステップ1: AI解析
      const analyzeRes = await fetch(`/api/meeting-records/${id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const analyzeData = await analyzeRes.json();

      if (!analyzeData.success) {
        setReanalyzeError(analyzeData.error || '解析に失敗しました');
        return;
      }

      // ステップ2: 検討ツリー生成（topicsがあれば）
      const topics = analyzeData.data?.analysis?.topics;
      console.log('[再解析] topics:', topics?.length || 0, '件', topics);
      if (topics && topics.length > 0) {
        const record = records.find(r => r.id === id);
        const treeRes = await fetch('/api/decision-trees/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: record?.project_id || projectId,
            meeting_record_id: id,
            topics,
          }),
        });
        const treeData = await treeRes.json();
        console.log('[再解析] 検討ツリー生成結果:', treeData);
      } else {
        console.log('[再解析] topicsが空のため検討ツリー生成をスキップ');
      }

      // リスト更新
      await fetchRecords();
      // 親に通知（タスク提案パネル等のリフレッシュ用）
      onAnalyzed?.();
    } catch (err) {
      console.error('[MeetingRecordList] 再解析エラー:', err);
      setReanalyzeError('再解析中にエラーが発生しました');
    } finally {
      setReanalyzingId(null);
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
                  handleDelete(record.id);
                }}
                className="p-1 text-slate-300 hover:text-red-500 transition-colors shrink-0"
                title="削除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

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
