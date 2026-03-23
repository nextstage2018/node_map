// v11.0: ② 1日のタスク
'use client';

import { Calendar } from 'lucide-react';

interface Props {
  today: {
    created_as_requester: number;
    created_as_assignee: number;
    completed_as_requester: number;
    completed_as_assignee: number;
  };
}

export default function DailyTaskSummary({ today }: Props) {
  const rows = [
    { label: '作成（依頼）', value: today.created_as_requester, color: 'bg-blue-100 text-blue-700' },
    { label: '作成（担当）', value: today.created_as_assignee, color: 'bg-blue-100 text-blue-700' },
    { label: '完了（依頼）', value: today.completed_as_requester, color: 'bg-green-100 text-green-700' },
    { label: '完了（担当）', value: today.completed_as_assignee, color: 'bg-green-100 text-green-700' },
  ];

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-700">今日のタスク</h2>
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <span className="text-sm text-slate-600">{row.label}</span>
            <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-full ${row.color}`}>
              {row.value}件
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
