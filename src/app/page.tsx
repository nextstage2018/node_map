// ホーム → 組織・プロジェクト一覧にリダイレクト
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/organizations');
}
