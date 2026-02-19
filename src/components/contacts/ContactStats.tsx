'use client';

import { RELATIONSHIP_TYPE_CONFIG, CHANNEL_CONFIG } from '@/lib/constants';
import type { ContactStats as ContactStatsType } from '@/lib/types';

interface ContactStatsProps {
  stats: ContactStatsType;
}

export default function ContactStats({ stats }: ContactStatsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* 全体 */}
      <div className="p-4 bg-white rounded-xl border border-slate-200">
        <p className="text-xs text-slate-400 mb-1">コンタクト数</p>
        <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
      </div>
      <div className="p-4 bg-white rounded-xl border border-slate-200">
        <p className="text-xs text-slate-400 mb-1">未確認</p>
        <p className="text-2xl font-bold text-amber-600">{stats.unconfirmedCount}</p>
      </div>

      {/* 関係属性別 */}
      {(Object.entries(RELATIONSHIP_TYPE_CONFIG) as [string, typeof RELATIONSHIP_TYPE_CONFIG[keyof typeof RELATIONSHIP_TYPE_CONFIG]][]).map(
        ([key, cfg]) => (
          <div key={key} className="p-3 bg-white rounded-xl border border-slate-200">
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2.5 h-2.5 rounded-full ${cfg.dotColor}`} />
              <span className="text-xs text-slate-500">{cfg.label}</span>
            </div>
            <p className="text-xl font-bold text-slate-900">
              {stats.byRelationship[key as keyof typeof stats.byRelationship] || 0}
            </p>
          </div>
        )
      )}

      {/* チャネル別 */}
      {(Object.entries(CHANNEL_CONFIG) as [string, typeof CHANNEL_CONFIG[keyof typeof CHANNEL_CONFIG]][]).map(
        ([key, cfg]) => (
          <div key={key} className="p-3 bg-white rounded-xl border border-slate-200">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-slate-500">{cfg.label}</span>
            </div>
            <p className="text-xl font-bold text-slate-900">
              {stats.byChannel[key as keyof typeof stats.byChannel] || 0}
            </p>
          </div>
        )
      )}
    </div>
  );
}
