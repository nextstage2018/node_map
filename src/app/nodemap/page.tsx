// V2: NodeMapページは廃止 — 組織・PJにリダイレクト
import { redirect } from 'next/navigation';

export default function NodeMapPage() {
  redirect('/organizations');
}
