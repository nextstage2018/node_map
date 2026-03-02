// Phase A-1: 旧エージェントページ → メインページにリダイレクト
import { redirect } from 'next/navigation';

export default function AgentPage() {
  redirect('/');
}
