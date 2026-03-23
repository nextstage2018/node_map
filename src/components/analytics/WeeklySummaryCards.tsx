// v11.0: ① 週間サマリー（3指標カード）
'use client';

import { TrendingUp, CheckCircle, MessageSquare } from 'lucide-react';

interface Props {
  summary: {
    created: number;
    completed: number;
    involved: number;
  };
  periodLabel: string;
}

export default function WeeklySummaryCards({ summary, periodLabel }: Props) {
  const cards = [
    {
      label: '作成タスク',
      value: summary.created,
      icon: TrendingUp,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: '完了タスク',
      value: summary.completed,
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      label: 'AI相談タスク',
      value: summary.involved,
      icon: MessageSquare,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
  ];

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">期間サマリー</h2>
      <div className="grid grid-cols-3 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="text-center">
              <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full ${card.bgColor} mb-2`}>
                <Icon className={`w-5 h-5 ${card.color}`} />
              </div>
              <div className="text-2xl font-bold text-slate-900">{card.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{card.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
