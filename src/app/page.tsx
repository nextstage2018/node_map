// Phase A-1: メインページ → 秘書AI会話画面
'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import AppLayout from '@/components/shared/AppLayout';
import SecretaryChat from '@/components/secretary/SecretaryChat';

function HomeContent() {
  const searchParams = useSearchParams();
  const initialMessage = searchParams.get('message') || undefined;
  const taskId = searchParams.get('taskId') || undefined;
  const projectId = searchParams.get('projectId') || undefined;

  return (
    <AppLayout>
      <SecretaryChat
        initialMessage={initialMessage}
        contextTaskId={taskId}
        contextProjectId={projectId}
      />
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
