// v11.0: ⑥ プロジェクト別進捗
'use client';

import { FolderOpen } from 'lucide-react';

interface ProjectData {
  project_id: string;
  project_name: string;
  org_name: string;
  total: number;
  completed: number;
  overdue: number;
  completion_rate: number;
}

interface Props {
  projects: ProjectData[];
}

export default function ProjectProgressTable({ projects }: Props) {
  if (projects.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 lg:col-span-2">
        <div className="flex items-center gap-2 mb-4">
          <FolderOpen className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">プロジェクト別進捗</h2>
        </div>
        <p className="text-sm text-slate-400 text-center py-6">プロジェクトデータがありません</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 lg:col-span-2">
      <div className="flex items-center gap-2 mb-4">
        <FolderOpen className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-700">プロジェクト別進捗</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left py-2 px-2 text-xs font-medium text-slate-500">プロジェクト</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-slate-500">組織</th>
              <th className="text-center py-2 px-2 text-xs font-medium text-slate-500">全タスク</th>
              <th className="text-center py-2 px-2 text-xs font-medium text-slate-500">完了</th>
              <th className="text-center py-2 px-2 text-xs font-medium text-slate-500">期限切れ</th>
              <th className="py-2 px-2 text-xs font-medium text-slate-500 w-40">完了率</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.project_id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td className="py-2.5 px-2 font-medium text-slate-800">{p.project_name}</td>
                <td className="py-2.5 px-2 text-slate-500 text-xs">{p.org_name}</td>
                <td className="text-center py-2.5 px-2 text-slate-600">{p.total}</td>
                <td className="text-center py-2.5 px-2 text-green-600 font-medium">{p.completed}</td>
                <td className="text-center py-2.5 px-2">
                  {p.overdue > 0 ? (
                    <span className="text-red-600 font-medium">{p.overdue}</span>
                  ) : (
                    <span className="text-slate-400">0</span>
                  )}
                </td>
                <td className="py-2.5 px-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${p.completion_rate}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 w-8 text-right">{p.completion_rate}%</span>
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
