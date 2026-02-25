// Phase 30b: コンタクト簡単追加モーダル
'use client';

import { useState, useEffect } from 'react';
import { X, UserPlus, Building2 } from 'lucide-react';

interface Organization {
  id: string;
  name: string;
  domain?: string;
}

interface QuickAddContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function QuickAddContactModal({ isOpen, onClose, onSaved }: QuickAddContactModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [isTeamMember, setIsTeamMember] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 組織一覧を取得
  useEffect(() => {
    if (!isOpen) return;
    const fetchOrgs = async () => {
      try {
        const res = await fetch('/api/organizations');
        const data = await res.json();
        if (data.success) {
          setOrganizations(data.data || []);
        }
      } catch {
        // 組織取得失敗は無視（選択肢が出ないだけ）
      }
    };
    fetchOrgs();
  }, [isOpen]);

  // モーダルを開くたびにフォームをリセット
  useEffect(() => {
    if (isOpen) {
      setName('');
      setEmail('');
      setPhone('');
      setOrganizationId('');
      setIsTeamMember(false);
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('名前は必須です');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Phase 30b: コンタクトをAPIで作成
      const res = await fetch('/api/contacts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          address: email.trim() || undefined,
          phone: phone.trim() || undefined,
          organizationId: organizationId || undefined,
          isTeamMember,
          mainChannel: 'email',
          messageCount: 0,
          lastContactAt: new Date().toISOString(),
          relationshipType: isTeamMember ? 'internal' : 'unknown',
          confirmed: true,
        }),
      });

      const data = await res.json();
      if (data.success) {
        onSaved();
        onClose();
      } else {
        setError(data.error || '保存に失敗しました');
      }
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">コンタクトを追加</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* フォーム */}
        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          {/* 名前（必須） */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              名前 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 田中 太郎"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          {/* メールアドレス */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="例: tanaka@example.com"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 電話番号 */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              電話番号
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="例: 090-1234-5678"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 組織選択 */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1">
              <Building2 className="w-3.5 h-3.5" />
              組織
            </label>
            <select
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">未選択</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}{org.domain ? ` (${org.domain})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* チームメンバーフラグ */}
          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isTeamMember}
                onChange={(e) => setIsTeamMember(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
            </label>
            <span className="text-sm text-slate-700">自社チームメンバー</span>
          </div>
        </div>

        {/* フッター */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50 rounded-b-lg">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isSaving ? '保存中...' : '追加'}
          </button>
        </div>
      </div>
    </div>
  );
}
