'use client';

import { useState, useEffect } from 'react';
import type { UserPreferences } from '@/lib/types';
import { EMAIL_DIGEST_OPTIONS } from '@/lib/constants';
import Button from '@/components/ui/Button';

interface UserPreferencesCardProps {
  preferences: UserPreferences;
  onSave: (prefs: Partial<UserPreferences>) => Promise<{ success: boolean }>;
}

export default function UserPreferencesCard({
  preferences,
  onSave,
}: UserPreferencesCardProps) {
  const [form, setForm] = useState<UserPreferences>(preferences);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setForm(preferences);
  }, [preferences]);

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    const result = await onSave(form);
    setIsSaving(false);
    if (result.success) {
      setMessage('保存しました');
      setTimeout(() => setMessage(null), 3000);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h2 className="text-base font-bold text-slate-900 mb-4">表示・通知設定</h2>
      <div className="space-y-4 max-w-md">
        {/* 通知 */}
        <label className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-slate-700">通知</div>
            <div className="text-xs text-slate-400">新着メッセージの通知を受け取る</div>
          </div>
          <button
            onClick={() => setForm((p) => ({ ...p, notificationsEnabled: !p.notificationsEnabled }))}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              form.notificationsEnabled ? 'bg-blue-600' : 'bg-slate-300'
            }`}
          >
            <div
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                form.notificationsEnabled ? 'translate-x-5.5 left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </label>

        {/* メールダイジェスト */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            メールダイジェスト
          </label>
          <select
            value={form.emailDigest}
            onChange={(e) =>
              setForm((p) => ({ ...p, emailDigest: e.target.value as UserPreferences['emailDigest'] }))
            }
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {EMAIL_DIGEST_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* デフォルトフィルタ */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            インボックスのデフォルト表示
          </label>
          <select
            value={form.defaultInboxFilter}
            onChange={(e) =>
              setForm((p) => ({ ...p, defaultInboxFilter: e.target.value as UserPreferences['defaultInboxFilter'] }))
            }
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">すべて</option>
            <option value="email">Gmail のみ</option>
            <option value="slack">Slack のみ</option>
            <option value="chatwork">Chatwork のみ</option>
          </select>
        </div>

        {/* AIオートサジェスト */}
        <label className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-slate-700">AI自動提案</div>
            <div className="text-xs text-slate-400">メッセージからタスクを自動提案</div>
          </div>
          <button
            onClick={() => setForm((p) => ({ ...p, aiAutoSuggest: !p.aiAutoSuggest }))}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              form.aiAutoSuggest ? 'bg-blue-600' : 'bg-slate-300'
            }`}
          >
            <div
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                form.aiAutoSuggest ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </label>

        {message && (
          <div className="p-3 bg-green-50 text-green-700 rounded-lg text-xs font-medium">
            {message}
          </div>
        )}

        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? '保存中...' : '設定を保存'}
        </Button>
      </div>
    </div>
  );
}
