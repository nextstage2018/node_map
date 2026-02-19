'use client';

import type { NodeData, EdgeData, ClusterData, ClusterDiff } from '@/lib/types';
import { KNOWLEDGE_DOMAIN_CONFIG, RELATIONSHIP_TYPE_CONFIG } from '@/lib/constants';

interface MapStatsProps {
  nodes: NodeData[];
  edges: EdgeData[];
  clusters: ClusterData[];
  clusterDiff: ClusterDiff | null;
  selectedTaskId: string | null;
}

export default function MapStats({
  nodes,
  edges,
  clusters,
  clusterDiff,
  selectedTaskId,
}: MapStatsProps) {
  const keywordCount = nodes.filter((n) => n.type === 'keyword').length;
  const personCount = nodes.filter((n) => n.type === 'person').length;
  const projectCount = nodes.filter((n) => n.type === 'project').length;

  const recognitionCount = nodes.filter((n) => n.understandingLevel === 'recognition').length;
  const understandingCount = nodes.filter((n) => n.understandingLevel === 'understanding').length;
  const masteryCount = nodes.filter((n) => n.understandingLevel === 'mastery').length;

  return (
    <div className="space-y-4">
      {/* 全体統計 */}
      <div>
        <h4 className="text-xs font-semibold text-slate-500 mb-2">全体統計</h4>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-slate-900">{nodes.length}</div>
            <div className="text-[10px] text-slate-500">ノード</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-slate-900">{edges.length}</div>
            <div className="text-[10px] text-slate-500">エッジ</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-slate-900">{clusters.length}</div>
            <div className="text-[10px] text-slate-500">クラスター</div>
          </div>
        </div>
      </div>

      {/* 種別内訳 */}
      <div>
        <h4 className="text-xs font-semibold text-slate-500 mb-2">ノード種別</h4>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600">キーワード</span>
            <span className="font-medium text-slate-900">{keywordCount}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600">人物</span>
            <span className="font-medium text-slate-900">{personCount}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600">プロジェクト</span>
            <span className="font-medium text-slate-900">{projectCount}</span>
          </div>
        </div>
      </div>

      {/* 理解度分布 */}
      <div>
        <h4 className="text-xs font-semibold text-slate-500 mb-2">理解度分布</h4>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            <div className="flex-1">
              <div className="flex justify-between mb-0.5">
                <span className="text-slate-600">認知</span>
                <span className="font-medium">{recognitionCount}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-slate-400 rounded-full"
                  style={{ width: `${nodes.length > 0 ? (recognitionCount / nodes.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="flex-1">
              <div className="flex justify-between mb-0.5">
                <span className="text-slate-600">理解</span>
                <span className="font-medium">{understandingCount}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${nodes.length > 0 ? (understandingCount / nodes.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="flex-1">
              <div className="flex justify-between mb-0.5">
                <span className="text-slate-600">習熟</span>
                <span className="font-medium">{masteryCount}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: `${nodes.length > 0 ? (masteryCount / nodes.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 領域分布 */}
      <div>
        <h4 className="text-xs font-semibold text-slate-500 mb-2">領域分布</h4>
        <div className="space-y-1.5">
          {Object.entries(KNOWLEDGE_DOMAIN_CONFIG).map(([domainId, cfg]) => {
            const count = nodes.filter((n) => n.domainId === domainId).length;
            if (count === 0) return null;
            return (
              <div key={domainId} className="flex items-center gap-2 text-xs">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: cfg.color }}
                />
                <span className="flex-1 text-slate-600">{cfg.name}</span>
                <span className="font-medium text-slate-900">{count}</span>
              </div>
            );
          })}
          {(() => {
            const unclassified = nodes.filter(
              (n) => !n.domainId && (n.type === 'keyword' || n.type === 'project')
            ).length;
            if (unclassified === 0) return null;
            return (
              <div className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full shrink-0 bg-slate-300" />
                <span className="flex-1 text-slate-400">未分類</span>
                <span className="font-medium text-slate-400">{unclassified}</span>
              </div>
            );
          })()}
        </div>
      </div>

      {/* 関係属性分布（人物ノード） */}
      {personCount > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-500 mb-2">関係属性</h4>
          <div className="space-y-1.5">
            {(Object.entries(RELATIONSHIP_TYPE_CONFIG) as [string, typeof RELATIONSHIP_TYPE_CONFIG[keyof typeof RELATIONSHIP_TYPE_CONFIG]][]).map(
              ([key, cfg]) => {
                const count = nodes.filter(
                  (n) => n.type === 'person' && n.relationshipType === key
                ).length;
                if (count === 0) return null;
                return (
                  <div key={key} className="flex items-center gap-2 text-xs">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: cfg.color }}
                    />
                    <span className="flex-1 text-slate-600">{cfg.label}</span>
                    <span className="font-medium text-slate-900">{count}</span>
                  </div>
                );
              }
            )}
            {(() => {
              const unlinked = nodes.filter(
                (n) => n.type === 'person' && !n.relationshipType
              ).length;
              if (unlinked === 0) return null;
              return (
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-2 h-2 rounded-full shrink-0 bg-slate-300" />
                  <span className="flex-1 text-slate-400">未分類</span>
                  <span className="font-medium text-slate-400">{unlinked}</span>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* クラスター差分（タスク選択時） */}
      {selectedTaskId && clusterDiff && (
        <div className="border-t border-slate-100 pt-4">
          <h4 className="text-xs font-semibold text-slate-500 mb-2">構想 vs 結果</h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">構想時のノード数</span>
              <span className="font-medium text-blue-600">{clusterDiff.ideationNodeIds.length}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">結果時のノード数</span>
              <span className="font-medium text-green-600">{clusterDiff.resultNodeIds.length}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">新たに発見</span>
              <span className="font-medium text-amber-600">+{clusterDiff.addedNodeIds.length}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">脱落</span>
              <span className="font-medium text-red-500">-{clusterDiff.removedNodeIds.length}</span>
            </div>
            {clusterDiff.discoveredOnPath.length > 0 && (
              <div className="mt-2 p-2 bg-amber-50 rounded-lg border border-amber-100">
                <div className="text-[10px] font-semibold text-amber-700 mb-1">経路上の発見</div>
                <div className="flex flex-wrap gap-1">
                  {clusterDiff.discoveredOnPath.map((nodeId) => {
                    const node = nodes.find((n) => n.id === nodeId);
                    return (
                      <span
                        key={nodeId}
                        className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px]"
                      >
                        {node?.label || nodeId}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
