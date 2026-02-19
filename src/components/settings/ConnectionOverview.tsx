'use client';

import Image from 'next/image';
import { ServiceConnection, ServiceType } from '@/lib/types';
import { SERVICE_CONFIG, CONNECTION_STATUS_CONFIG } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface ConnectionOverviewProps {
  connections: ServiceConnection[];
  connectedCount: number;
  totalCount: number;
}

export default function ConnectionOverview({
  connections,
  connectedCount,
  totalCount,
}: ConnectionOverviewProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-slate-900">接続ステータス</h2>
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold text-slate-700">
            {connectedCount}/{totalCount}
          </div>
          <span className="text-xs text-slate-400">接続済み</span>
        </div>
      </div>

      {/* プログレスバー */}
      <div className="w-full h-2 bg-slate-100 rounded-full mb-5">
        <div
          className="h-2 bg-green-500 rounded-full transition-all duration-500"
          style={{ width: `${(connectedCount / totalCount) * 100}%` }}
        />
      </div>

      {/* サービス一覧 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {connections.map((conn) => {
          const serviceConfig = SERVICE_CONFIG[conn.type as keyof typeof SERVICE_CONFIG];
          const statusConfig = CONNECTION_STATUS_CONFIG[conn.status];

          return (
            <div
              key={conn.type}
              className={cn(
                'p-3 rounded-xl border transition-all',
                conn.status === 'connected'
                  ? 'bg-green-50 border-green-200'
                  : conn.status === 'error'
                  ? 'bg-red-50 border-red-200'
                  : 'bg-slate-50 border-slate-200'
              )}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Image src={serviceConfig.icon} alt={serviceConfig.label} width={20} height={20} />
                <span className="text-sm font-semibold text-slate-800">
                  {serviceConfig.label}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  className={cn('w-2 h-2 rounded-full', statusConfig.dotColor)}
                />
                <span className={cn('text-[11px] font-medium', statusConfig.color.split(' ')[1])}>
                  {statusConfig.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
