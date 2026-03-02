// 削除済み - 種ボックスページは廃止
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SeedsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/tasks');
  }, [router]);
  return null;
}
