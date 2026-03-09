// V2: 種ボックスは完全廃止 — ページ削除相当（空リダイレクト）
import { redirect } from 'next/navigation';

export default function SeedsPage() {
  redirect('/organizations');
}
