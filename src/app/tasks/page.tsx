// V2: タスクはプロジェクト詳細のタスクタブに統合
import { redirect } from 'next/navigation';

export default function TasksPage() {
  redirect('/organizations');
}
