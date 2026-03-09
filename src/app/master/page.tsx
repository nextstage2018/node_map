// V2: ナレッジページは廃止（UIなし。ナレッジはバックエンド基盤としてAIが自動参照）
import { redirect } from 'next/navigation';

export default function MasterPage() {
  redirect('/settings');
}
