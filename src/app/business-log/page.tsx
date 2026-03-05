// Phase UI-7: /business-log は /organizations へリダイレクト（URL直アクセスは維持）
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function BusinessLogRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/organizations');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-sm text-slate-400">リダイレクト中...</p>
    </div>
  );
}
