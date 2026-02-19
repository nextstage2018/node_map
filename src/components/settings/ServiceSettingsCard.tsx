'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { ServiceType, ServiceConnection, ConnectionTestResponse } from '@/lib/types';
import { SERVICE_CONFIG, CONNECTION_STATUS_CONFIG, CLAUDE_MODELS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import Button from '@/components/ui/Button';

interface ServiceSettingsCardProps {
  serviceType: ServiceType;
  connection: ServiceConnection;
  onSave: (service: ServiceType, settings: Record<string, string>) => Promise<{ success: boolean; error?: string }>;
  onTest: (service: ServiceType) => Promise<ConnectionTestResponse>;
}

export default function ServiceSettingsCard({
  serviceType,
  connection,
  onSave,
  onTest,
}: ServiceSettingsCardProps) {
  const config = SERVICE_CONFIG[serviceType as keyof typeof SERVICE_CONFIG];
  const statusConfig = CONNECTION_STATUS_CONFIG[connection.status];

  const [isOpen, setIsOpen] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResponse | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    const result = await onSave(serviceType, formValues);
    setIsSaving(false);
    if (result.success) {
      setSaveMessage({ type: 'success', text: '設定を保存しました' });
      setTimeout(() => setSaveMessage(null), 3000);
    } else {
      setSaveMessage({ type: 'error', text: result.error || '保存に失敗しました' });
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    const result = await onTest(serviceType);
    setTestResult(result);
    setIsTesting(false);
    setTimeout(() => setTestResult(null), 5000);
  };

  const hasRequiredFields = config.fields
    .filter((f) => f.required)
    .every((f) => formValues[f.key]?.trim());

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* カードヘッダー（クリックで展開） */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', config.color.split(' ')[0])}>
            <Image src={config.icon} alt={config.label} width={24} height={24} />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-bold text-slate-900">{config.label}</h3>
            <p className="text-xs text-slate-500">{config.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className={cn('w-2 h-2 rounded-full', statusConfig.dotColor)} />
            <span className={cn('text-xs font-medium', statusConfig.color.split(' ')[1])}>
              {statusConfig.label}
            </span>
          </div>
          <svg
            className={cn(
              'w-5 h-5 text-slate-400 transition-transform',
              isOpen && 'rotate-180'
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* 展開フォーム */}
      {isOpen && (
        <div className="px-5 pb-5 border-t border-slate-100">
          <div className="pt-4 space-y-3">
            {config.fields.map((field) => (
              <div key={field.key}>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                {field.type === 'select' && 'options' in field ? (
                  <select
                    value={formValues[field.key] || ''}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  >
                    <option value="">選択してください</option>
                    {CLAUDE_MODELS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type}
                    value={formValues[field.key] || ''}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                )}
              </div>
            ))}
          </div>

          {/* テスト結果 */}
          {testResult && (
            <div
              className={cn(
                'mt-3 p-3 rounded-lg text-xs font-medium',
                testResult.success
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              )}
            >
              {testResult.success ? '✅' : '❌'} {testResult.message}
              {testResult.latencyMs && (
                <span className="ml-2 text-slate-400">({testResult.latencyMs}ms)</span>
              )}
            </div>
          )}

          {/* 保存メッセージ */}
          {saveMessage && (
            <div
              className={cn(
                'mt-3 p-3 rounded-lg text-xs font-medium',
                saveMessage.type === 'success'
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              )}
            >
              {saveMessage.text}
            </div>
          )}

          {/* ボタン */}
          <div className="flex items-center gap-2 mt-4">
            <Button
              onClick={handleTest}
              variant="secondary"
              disabled={isTesting}
              className="text-xs"
            >
              {isTesting ? (
                <span className="flex items-center gap-1">
                  <span className="animate-spin">⟳</span> テスト中...
                </span>
              ) : (
                '接続テスト'
              )}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasRequiredFields || isSaving}
              className="text-xs"
            >
              {isSaving ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
