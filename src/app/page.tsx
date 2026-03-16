// v9.0: メインページ → 3カード型ダッシュボード
'use client';

import { Suspense } from 'react';
import AppLayout from '@/components/shared/AppLayout';
import SecretaryDashboard from '@/components/secretary/SecretaryDashboard';

function HomeContent() {
  return (
    <AppLayout>
      <SecretaryDashboard />
    </AppLayout>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<AppLayout><div className="flex items-center justify-center h-full text-slate-400">読み込み中...</div></AppLayout>}>
      <HomeContent />
    </Suspense>
  );
}
