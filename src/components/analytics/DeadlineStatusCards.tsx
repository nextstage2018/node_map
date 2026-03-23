// v11.0: ④ 期限ステータス分布
'use client';

import { Clock, AlertCircle, CheckCircle, Calendar, MinusCircle } from 'lucide-react';

interface StatusItem {
  count: number;
  percent: number;
}

interface Props {
  deadlineStatus: {
    with_deadline: StatusItem;
    no_deadline: StatusItem;
    on_track: StatusItem;
    overdue: StatusItem;
  };
}

export default function DeadlineStatusCards({ deadlineStatus }: Props) {
  const items = [
    {
      label: '期限設定',
      ...deadlineStatus.with_deadline,
      icon: Calendar,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
    },
    {
      label: '期限未設定',
      ...deadlineStatus.no_deadline,
      icon: MinusCircle,
      color: 'text-slate-500',
      bgColor: 'bg-slate-50',
      borderColor: 'border-slate-200',
    },
    {
      label: '予定通り',
      ...deadlineStatus.on_track,
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
    },
    {
      label: '期限切れ',
      ...deadlineStatus.overdue,
      icon: AlertCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
    },
  ];

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-700">期限ステータス（未完了タスク）</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className={`rounded-lg border ${item.borderColor} ${item.bgColor} p-3 flex items-center gap-3`}
            >
              <Icon className={`w-5 h-5 ${item.color} shrink-0`} />
              <div>
                <div className="text-lg font-bold text-slate-900">
                  {item.count}
                  <span className="text-xs font-normal text-slate-500 ml-1">({item.percent}%)</span>
                </div>
                <div className="text-xs text-slate-600">{item.label}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
