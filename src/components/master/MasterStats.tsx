'use client';

interface DomainStat {
  domainId: string;
  domainName: string;
  color: string;
  nodeCount: number;
  fieldCount: number;
}

interface MasterStatsProps {
  stats: DomainStat[];
  totalEntries: number;
  unclassifiedCount: number;
}

export default function MasterStats({
  stats,
  totalEntries,
  unclassifiedCount,
}: MasterStatsProps) {
  const totalNodes = stats.reduce((sum, s) => sum + s.nodeCount, 0);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* 全体統計 */}
      <div className="p-4 bg-white rounded-xl border border-slate-200">
        <p className="text-xs text-slate-400 mb-1">マスタキーワード数</p>
        <p className="text-2xl font-bold text-slate-900">{totalEntries}</p>
      </div>
      <div className="p-4 bg-white rounded-xl border border-slate-200">
        <p className="text-xs text-slate-400 mb-1">分類済みノード</p>
        <p className="text-2xl font-bold text-slate-900">{totalNodes}</p>
      </div>
      <div className="p-4 bg-white rounded-xl border border-slate-200">
        <p className="text-xs text-slate-400 mb-1">未分類ノード</p>
        <p className="text-2xl font-bold text-slate-900">{unclassifiedCount}</p>
      </div>
      <div className="p-4 bg-white rounded-xl border border-slate-200">
        <p className="text-xs text-slate-400 mb-1">領域数</p>
        <p className="text-2xl font-bold text-slate-900">{stats.length}</p>
      </div>

      {/* 領域別バー */}
      {stats.map((stat) => (
        <div key={stat.domainId} className="p-3 bg-white rounded-xl border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: stat.color }}
            />
            <span className="text-sm font-medium text-slate-700">{stat.domainName}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold text-slate-900">{stat.nodeCount}</span>
            <span className="text-xs text-slate-400">ノード</span>
            <span className="text-xs text-slate-300 ml-1">/ {stat.fieldCount}分野</span>
          </div>
          {/* 比率バー */}
          {totalNodes > 0 && (
            <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(stat.nodeCount / totalNodes) * 100}%`,
                  backgroundColor: stat.color,
                }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
