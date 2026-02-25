import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/auth/AuthProvider';
import KnowledgeToast from '@/components/knowledge/KnowledgeToast';

export const metadata: Metadata = {
  title: 'NodeMap - 統合インボックス',
  description: 'メール・Slack・Chatworkを一元管理する統合コミュニケーションツール',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
        <KnowledgeToast />
      </body>
    </html>
  );
}
