'use client';

import { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { KNOWLEDGE_DOMAIN_CONFIG } from '@/lib/constants';
import type { NodeType, NodeData } from '@/lib/types';
import Button from '@/components/ui/Button';

// ドメインに連動するフィールド定義
const DOMAIN_FIELDS: Record<string, { id: string; name: string }[]> = {
  domain_marketing: [
    { id: 'field_seo', name: 'SEO' },
    { id: 'field_advertising', name: '広告運用' },
    { id: 'field_content', name: 'コンテンツマーケティング' },
    { id: 'field_analytics', name: 'マーケティング分析' },
  ],
  domain_development: [
    { id: 'field_frontend', name: 'フロントエンド' },
    { id: 'field_backend', name: 'バックエンド' },
    { id: 'field_infra', name: 'インフラ・DevOps' },
  ],
  domain_sales: [
    { id: 'field_acquisition', name: '新規顧客獲得' },
    { id: 'field_account', name: 'アカウント管理' },
    { id: 'field_proposal', name: '提案・プレゼン' },
  ],
  domain_management: [
    { id: 'field_accounting', name: '経理・財務' },
    { id: 'field_hr', name: '人事・労務' },
    { id: 'field_legal', name: '法務・コンプライアンス' },
  ],
  domain_planning: [
    { id: 'field_strategy', name: '経営戦略' },
    { id: 'field_newbiz', name: '新規事業' },
    { id: 'field_branding', name: 'ブランド戦略' },
  ],
};

const NODE_TYPES: { key: NodeType; label: string; icon: string }[] = [
  { key: 'keyword', label: 'キーワード', icon: '#' },
  { key: 'person', label: '人物', icon: '@' },
  { key: 'project', label: 'プロジェクト', icon: '/' },
];

interface NodeRegistrationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onNodeAdded: (node: NodeData) => void;
  initialLabel?: string;
}

export default function NodeRegistrationDialog({
  isOpen,
  onClose,
  onNodeAdded,
  initialLabel = '',
}: NodeRegistrationDialogProps) {
  const [label, setLabel] = useState(initialLabel);
  const [type, setType] = useState<NodeType>('keyword');
  const [domainId, setDomainId] = useState<string>('');
  const [fieldId, setFieldId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ダイアログが開かれたらinitialLabelでフォームを初期化
  useEffect(() => {
    if (isOpen) {
      setLabel(initialLabel);
      setType('keyword');
      setDomainId('');
      setFieldId('');
      setError(null);
    }
  }, [isOpen, initialLabel]);

  const resetForm = useCallback(() => {
    setLabel(initialLabel);
    setType('keyword');
    setDomainId('');
    setFieldId('');
    setError(null);
  }, [initialLabel]);

  // ドメイン変更時にフィールドをリセット
  const handleDomainChange = (newDomainId: string) => {
    setDomainId(newDomainId);
    setFieldId('');
  };

  const handleSubmit = async () => {
    if (!label.trim()) {
      setError('ラベルを入力してください');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim(),
          type,
          domainId: domainId || undefined,
          fieldId: fieldId || undefined,
          sourceId: 'manual',
          direction: 'self',
        }),
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error || '登録に失敗しました');
        return;
      }

      onNodeAdded(json.data);
      resetForm();
      onClose();
    } catch {
      setError('ネットワークエラーが発生しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  const availableFields = domainId ? DOMAIN_FIELDS[domainId] || [] : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* オーバーレイ */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* ダイアログ本体 */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* ヘッダー */}
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">ノードを追加</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            思考マップに新しいノードを手動登録します
          </p>
        </div>

        {/* フォーム */}
        <div className="px-6 py-4 space-y-4">
          {/* ラベル */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              ラベル <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="キーワード、人名、プロジェクト名..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>

          {/* タイプ選択（セグメントボタン） */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              タイプ
            </label>
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              {NODE_TYPES.map((nt) => (
                <button
                  key={nt.key}
                  onClick={() => setType(nt.key)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all',
                    type === nt.key
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  <span className="text-sm font-bold opacity-60">{nt.icon}</span>
                  {nt.label}
                </button>
              ))}
            </div>
          </div>

          {/* ドメイン選択 */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              ドメイン <span className="text-slate-400">(オプション)</span>
            </label>
            <select
              value={domainId}
              onChange={(e) => handleDomainChange(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">選択しない</option>
              {Object.entries(KNOWLEDGE_DOMAIN_CONFIG).map(([id, cfg]) => (
                <option key={id} value={id}>
                  {cfg.name}
                </option>
              ))}
            </select>
          </div>

          {/* フィールド選択（ドメイン選択時のみ） */}
          {domainId && availableFields.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                フィールド <span className="text-slate-400">(オプション)</span>
              </label>
              <select
                value={fieldId}
                onChange={(e) => setFieldId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">選択しない</option>
                {availableFields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* エラー表示 */}
          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={handleClose}>
            キャンセル
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting || !label.trim()}
          >
            {isSubmitting ? '登録中...' : '登録する'}
          </Button>
        </div>
      </div>
    </div>
  );
}
