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
  const organizationId = searchParams.get('organizationId') || undefined;
  const messageId = searchParams.get('messageId') || undefined;
  const contactId = searchParams.get('contactId') || undefined;

  // URLパラメータ変更時にSecretryChatを再マウントする（Soft Navigation対策）
  const contextKey = [projectId, taskId, organizationId, messageId, contactId, initialMessage].filter(Boolean).join('-') || 'default';

  return (
    <AppLayout>
      <SecretaryChat
        key={contextKey}
        initialMessage={initialMessage}
        contextTaskId={taskId}
        contextProjectId={projectId}
        contextOrganizationId={organizationId}
        contextMessageId={messageId}
        contextContactId={contactId}
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
