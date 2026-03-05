// Phase UI-6: ナレッジページは思考マップに統合 → リダイレクト
// URL直アクセスは /thought-map?tab=knowledge にリダイレクト
import { redirect } from 'next/navigation';

export default function MasterPage() {
  redirect('/thought-map?tab=knowledge');
}
