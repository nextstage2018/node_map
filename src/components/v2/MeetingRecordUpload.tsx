// V2-D: 会議録アップロードフォーム
'use client';

import { useState } from 'react';
import { FileText, Loader2, Sparkles } from 'lucide-react';

interface MeetingRecordUploadProps {
  projectId: string;
  onRecordCreated?: () => void;
}

export default function MeetingRecordUpload({ projectId, onRecordCreated }: MeetingRecordUploadProps) {
  const [title, setTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim() || !meetingDate) {
      setError('タイトル、日付、会議内容は全て必須です');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

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
        // AI解析失敗でも登録自体は成功とする
        setSuccessMessage('会議録を登録しました（AI解析は失敗しました）');
      } else {
        setSuccessMessage('会議録を登録し、AI解析が完了しました');
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
