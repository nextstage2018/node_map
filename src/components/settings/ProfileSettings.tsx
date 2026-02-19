'use client';

import { useState, useEffect } from 'react';
import type { ProfileSettings as ProfileSettingsType } from '@/lib/types';
import { TIMEZONE_OPTIONS } from '@/lib/constants';
import Button from '@/components/ui/Button';

interface ProfileSettingsProps {
  profile: ProfileSettingsType | null;
  onSave: (profile: Partial<ProfileSettingsType>) => Promise<{ success: boolean; error?: string }>;
}

export default function ProfileSettings({ profile, onSave }: ProfileSettingsProps) {
  const [form, setForm] = useState({
    displayName: '',
    email: '',
    timezone: 'Asia/Tokyo',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (profile) {
      setForm({
        displayName: profile.displayName,
        email: profile.email,
        timezone: profile.timezone,
      });
    }
  }, [profile]);

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    const result = await onSave(form);
    setIsSaving(false);
    if (result.success) {
      setMessage({ type: 'success', text: 'プロフィールを保存しました' });
      setTimeout(() => setMessage(null), 3000);
    } else {
      setMessage({ type: 'error', text: result.error || '保存に失敗しました' });
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h2 className="text-base font-bold text-slate-900 mb-4">プロフィール設定</h2>

      <div className="space-y-4 max-w-md">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            表示名
          </label>
          <input
            type="text"
            value={form.displayName}
            onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))}
            placeholder="あなたの名前"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            メールアドレス
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="email@example.com"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            タイムゾーン
          </label>
          <select
            value={form.timezone}
            onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          >
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>

        {message && (
          <div
            className={`p-3 rounded-lg text-xs font-medium ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {message.text}
          </div>
        )}

        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? '保存中...' : 'プロフィールを保存'}
        </Button>
      </div>
    </div>
  );
}
