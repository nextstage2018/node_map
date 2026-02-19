'use client';

import type { Job, JobStatus } from '@/lib/types';
import { JOB_STATUS_CONFIG } from '@/lib/constants';
import JobCard from './JobCard';

interface JobListProps {
  jobs: Job[];
  onExecute: (jobId: string) => Promise<void>;
  onDismiss: (jobId: string) => Promise<void>;
}

const STATUS_ORDER: JobStatus[] = ['proposed', 'draft', 'executed', 'dismissed'];

export default function JobList({ jobs, onExecute, onDismiss }: JobListProps) {
  // ステータスごとにグループ化
  const grouped = STATUS_ORDER.reduce((acc, status) => {
    const filtered = jobs.filter((j) => j.status === status);
    if (filtered.length > 0) acc.push({ status, jobs: filtered });
    return acc;
  }, [] as { status: JobStatus; jobs: Job[] }[]);

  if (jobs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="text-center">
          <p className="text-slate-400 text-sm">ジョブはまだありません</p>
          <p className="text-slate-300 text-xs mt-1">
            AIが定型作業を検知すると、ここに提案されます
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      {grouped.map(({ status, jobs: groupJobs }) => {
        const config = JOB_STATUS_CONFIG[status];
        return (
          <div key={status}>
            {/* グループヘッダー */}
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2 h-2 rounded-full ${config.dotColor}`} />
              <h3 className="text-sm font-medium text-slate-700">{config.label}</h3>
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                {groupJobs.length}
              </span>
            </div>

            {/* ジョブカード */}
            <div className="space-y-3">
              {groupJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  onExecute={onExecute}
                  onDismiss={onDismiss}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
