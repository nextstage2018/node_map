// Phase A-1: メインページ → 秘書AI会話画面
'use client';

import AppLayout from '@/components/shared/AppLayout';
import SecretaryChat from '@/components/secretary/SecretaryChat';

export default function Home() {
  return (
    <AppLayout>
      <SecretaryChat />
    </AppLayout>
  );
}
