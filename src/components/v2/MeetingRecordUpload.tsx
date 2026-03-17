// V2-D/V2-E: 会議録アップロードフォーム（検討ツリー反映機能付き）
'use client';

import { useState } from 'react';
import { FileText, Loader2, Sparkles, GitBranch } from 'lucide-react';

interface AnalysisTopics {
  title: string;
  options: string[];
  decision: string | null;
  status: 'active' | 'completed' | 'cancelled';
}

interface MeetingRecordUploadProps {
  projectId: string;
  onRecordCreated?: () => void;
  onTreeUpdated?: () => void;
}

export default function MeetingRecordUpload({ projectId, onRecordCreated, onTreeUpdated }: MeetingRecordUploadProps) {
  const [title, setTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // V2-E: AI解析結果を保持（検討ツリー反映用）
  const [analysisResult, setAnalysisResult] = useState<{
    recordId: string;
    topics: AnalysisTopics[];
  } | null>(null);
  const [isGeneratingTree, setIsGeneratingTree] = useState(false);
  const [treeMessage, setTreeMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim() || !meetingDate) {
      setError('タイトル、日付、会議内容は全て必須です');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    setAnalysisResult(null);
    setTreeMessage(null);
    try {
      // 1. 会議録を登録
      const createRes = await fetch('/api/meeting-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          title: title.trim(),
          meeting_date: meetingDate,
          content: content.trim(),
          source_type: 'text',
        }),
      });

      const createData = await createRes.json();
      if (!createData.success) {
        throw new Error(createData.error || '会議録の登録に失敗しました');
      }

      const recordId = createData.data.id;

      // 2. AI解析を実行
      const analyzeRes = await fetch(`/api/meeting-records/${recordId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const analyzeData = await analyzeRes.json();
      if (!analyzeData.success) {
        setSuccessMessage('会議録を登録しました（AI解析は失敗しました）');
      } else {
        // v7.0: analyze APIが検討ツリー生成まで一体化済み
        const treeResult = analyzeData.data?.tree_generated;
        if (treeResult && treeResult.created > 0) {
          setSuccessMessage(
            `会議録を登録し、検討ツリーに反映しました（新規: ${treeResult.created}ノード）`
          );
          onTreeUpdated?.();
        } else {
          setSuccessMessage('会議録を登録し、AI解析が完了しました');
        }

        // ゴール提案（v4.0-Phase5）は廃止済み。v8.0のMS自動承認に置き換え
      }

      // フォームをリセット
      setTitle('');
      setContent('');
      setMeetingDate(new Date().toISOString().split('T')[0]);
      onRecordCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登録に失敗しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  // V2-E: 検討ツリーに反映
  const handleGenerateTree = async () => {
    if (!analysisResult) return;

    setIsGeneratingTree(true);
    setTreeMessage(null);

    try {
      const res = await fetch('/api/decision-trees/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          meeting_record_id: analysisResult.recordId,
          topics: analysisResult.topics,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setTreeMessage(
          `検討ツリーに反映しました（新規: ${data.data.created_count}ノード、更新: ${data.data.updated_count}ノード）`
        );
        setAnalysisResult(null);
        onTreeUpdated?.();
      } else {
        setTreeMessage(`反映に失敗しました: ${data.error}`);
      }
    } catch (err) {
      console.error('検討ツリー生成エラー:', err);
      setTreeMessage('検討ツリーへの反映に失敗しました');
    } finally {
      setIsGeneratingTree(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-4 h-4 text-blue-600" />
        <h3 className="text-sm font-bold text-slate-800">会議録アップロード</h3>
      </div>

      <div className="space-y-3">
        {/* タイトル */}
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">タイトル</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: 第1回キックオフミーティング"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isSubmitting}
          />
        </div>

        {/* 日付 */}
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">会議日</label>
          <input
            type="date"
            value={meetingDate}
            onChange={(e) => setMeetingDate(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isSubmitting}
          />
        </div>

        {/* 会議内容 */}
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">会議内容</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="会議内容をここに貼り付けてください..."
            rows={8}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            disabled={isSubmitting}
          />
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
            {error}
          </div>
        )}

        {/* 成功表示 */}
        {successMessage && (
          <div className="px-3 py-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg">
            {successMessage}
          </div>
        )}

        {/* V2-E: 検討ツリー反映ボタン */}
        {analysisResult && (
          <div className="px-3 py-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-700 mb-2">
              AI解析で{analysisResult.topics.length}件のトピックが検出されました
            </p>
            <button
              onClick={handleGenerateTree}
              disabled={isGeneratingTree}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGeneratingTree ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  反映中...
                </>
              ) : (
                <>
                  <GitBranch className="w-3.5 h-3.5" />
                  検討ツリーに反映
                </>
              )}
            </button>
          </div>
        )}

        {/* V2-E: ツリー反映結果 */}
        {treeMessage && (
          <div className={`px-3 py-2 text-xs rounded-lg ${
            treeMessage.includes('失敗')
              ? 'text-red-700 bg-red-50 border border-red-200'
              : 'text-green-700 bg-green-50 border border-green-200'
          }`}>
            {treeMessage}
          </div>
        )}

        {/* ゴール提案承認UIは廃止済み（v8.0 MS自動承認に移行） */}

        {/* 送信ボタン */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !title.trim() || !content.trim() || !meetingDate}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              AI解析中...
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              AI解析して登録
            </>
          )}
        </button>
      </div>
    </div>
  );
}
