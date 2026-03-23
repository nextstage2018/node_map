// v11.0: ⑤ メンバー別進捗
'use client';

import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MemberData {
  contact_id: string;
  name: string;
  is_me: boolean;
  todo: number;
  in_progress: number;
  completed: number;
  overdue: number;
  total: number;
  completion_rate: number;
}

interface Props {
  members: MemberData[];
}

export default function MemberProgressTable({ members }: Props) {
  if (members.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 lg:col-span-2">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">メンバー別進捗</h2>
        </div>
        <p className="text-sm text-slate-400 text-center py-6">メンバーデータがありません</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 lg:col-span-2">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-700">メンバー別進捗</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left py-2 px-2 text-xs font-medium text-slate-500">メンバー</th>
              <th className="text-center py-2 px-2 text-xs font-medium text-slate-500">未着手</th>
              <th className="text-center py-2 px-2 text-xs font-medium text-slate-500">進行中</th>
              <th className="text-center py-2 px-2 text-xs font-medium text-slate-500">完了</th>
              <th className="text-center py-2 px-2 text-xs font-medium text-slate-500">期限切れ</th>
              <th className="py-2 px-2 text-xs font-medium text-slate-500 w-40">完了率</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr
                key={m.contact_id}
                className={cn(
                  'border-b border-slate-50 hover:bg-slate-50 transition-colors',
                  m.is_me && 'bg-blue-50/50'
                )}
              >
                <td className="py-2.5 px-2">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0',
                      m.is_me ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                    )}>
                      {m.name.charAt(0)}
                    </div>
                    <span className={cn('font-medium', m.is_me ? 'text-blue-700' : 'text-slate-800')}>
                      {m.name}
                      {m.is_me && <span className="text-xs text-blue-500 ml-1">（自分）</span>}
                    </span>
                  </div>
                </td>
                <td className="text-center py-2.5 px-2 text-slate-600">{m.todo}</td>
                <td className="text-center py-2.5 px-2 text-slate-600">{m.in_progress}</td>
                <td className="text-center py-2.5 px-2 text-green-600 font-medium">{m.completed}</td>
                <td className="text-center py-2.5 px-2">
                  {m.overdue > 0 ? (
                    <span className="text-red-600 font-medium">{m.overdue}</span>
                  ) : (
                    <span className="text-slate-400">0</span>
                  )}
                </td>
                <td className="py-2.5 px-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${m.completion_rate}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 w-8 text-right">{m.completion_rate}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
