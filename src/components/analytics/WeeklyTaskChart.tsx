// v11.0: ③ 週間タスクチャート（CSSベース棒グラフ）
'use client';

import { BarChart3 } from 'lucide-react';

interface ChartData {
  date: string;
  day: string;
  created: number;
  completed: number;
}

interface Props {
  dailyChart: ChartData[];
}

export default function WeeklyTaskChart({ dailyChart }: Props) {
  // 最大値を計算（バーの高さ比率用）
  const maxValue = Math.max(
    ...dailyChart.map(d => Math.max(d.created, d.completed)),
    1
  );

  const BAR_MAX_HEIGHT = 120; // px

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">タスク推移</h2>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-blue-400" />
            <span>作成</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-green-400" />
            <span>完了</span>
          </div>
        </div>
      </div>

      <div className="flex items-end justify-between gap-2" style={{ height: BAR_MAX_HEIGHT + 40 }}>
        {dailyChart.map((d) => {
          const createdHeight = maxValue > 0 ? (d.created / maxValue) * BAR_MAX_HEIGHT : 0;
          const completedHeight = maxValue > 0 ? (d.completed / maxValue) * BAR_MAX_HEIGHT : 0;

          return (
            <div key={d.date} className="flex-1 flex flex-col items-center">
              {/* 値表示 */}
              <div className="flex gap-0.5 mb-1 text-[10px] text-slate-400">
                {d.created > 0 && <span className="text-blue-500">{d.created}</span>}
                {d.created > 0 && d.completed > 0 && <span>/</span>}
                {d.completed > 0 && <span className="text-green-500">{d.completed}</span>}
              </div>
              {/* バー */}
              <div className="flex items-end gap-0.5" style={{ height: BAR_MAX_HEIGHT }}>
                <div
                  className="w-3 bg-blue-400 rounded-t-sm transition-all duration-300"
                  style={{ height: Math.max(createdHeight, d.created > 0 ? 4 : 0) }}
                />
                <div
                  className="w-3 bg-green-400 rounded-t-sm transition-all duration-300"
                  style={{ height: Math.max(completedHeight, d.completed > 0 ? 4 : 0) }}
                />
              </div>
              {/* 曜日ラベル */}
              <div className="mt-2 text-xs text-slate-500 font-medium">{d.day}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
