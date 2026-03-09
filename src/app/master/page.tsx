// V2: ナレッジページは設定ページ内に移動
import { redirect } from 'next/navigation';

export default function MasterPage() {
  redirect('/settings?tab=knowledge');
}
