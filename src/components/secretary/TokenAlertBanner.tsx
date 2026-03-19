// v10.4: トークン期限切れ警告バナー
// ダッシュボード上部に表示。問題がなければ非表示
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ServiceHealth {
  service: 'google' | 'slack' | 'chatwork';
  status: 'healthy' | 'expiring_soon' | 'expired' | 'invalid' | 'not_connected' | 'error';
  message: string;
}

const SERVICE_LABELS: Record<string, string> = {
  google: 'Google',
  slack: 'Slack',
  chatwork: 'Chatwork',
};

export default function TokenAlertBanner() {
  const [issues, setIssues] = useState<ServiceHealth[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/settings/token-health');
        const data = await res.json();
        if (data.success && data.data) {
          // expired / invalid のサービスのみ抽出
          const problemServices = (data.data.services as ServiceHealth[]).filter(
            s => s.status === 'expired' || s.status === 'invalid'
          );
          setIssues(problemServices);
        }
      } catch {
        // サイレントフェイル（ダッシュボードの表示をブロックしない）
      }
    };

    checkHealth();
  }, []);

  if (issues.length === 0 || dismissed) return null;

  const serviceNames = issues.map(s => SERVICE_LABELS[s.service]).join('・');

  return (
    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-red-500 text-lg shrink-0">⚠</span>
        <div>
          <p className="text-sm font-medium text-red-800">
            {serviceNames} の接続に問題があります
          </p>
          <p className="text-xs text-red-600 mt-0.5">
            {issues.map(s => s.message).join('、')}。
            <Link href="/settings" className="underline hover:text-red-800 ml-1">
              設定画面で確認
            </Link>
          </p>
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-red-400 hover:text-red-600 text-lg shrink-0 ml-2"
        title="閉じる"
      >
        ×
      </button>
    </div>
  );
}
