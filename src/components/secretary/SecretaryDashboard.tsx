// v9.0 + v10.4: 秘書ダッシュボード — 3カード構成 + トークンアラート
// インボックス返信 / カレンダー / タスクリマインダー
'use client';

import InboxReplyCard from './InboxReplyCard';
import CalendarWidget from './CalendarWidget';
import TaskReminderCard from './TaskReminderCard';
import TokenAlertBanner from './TokenAlertBanner';

export default function SecretaryDashboard() {
  return (
    <div className="h-full overflow-y-auto bg-nm-bg">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* v10.4: トークン期限切れ警告バナー（問題がある場合のみ表示） */}
        <TokenAlertBanner />

        {/* ヘッダー */}
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-nm-text">ダッシュボード</h1>
          <p className="text-xs text-nm-text-secondary mt-1">
            {new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </p>
        </div>

        {/* 3カードグリッド */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* カード1: インボックス返信 */}
          <InboxReplyCard />

          {/* カード2: カレンダー */}
          <CalendarWidget />

          {/* カード3: タスクリマインダー */}
          <TaskReminderCard />
        </div>
      </div>
    </div>
  );
}
