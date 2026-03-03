// Phase 57: マイナレッジパネル — カテゴリ別キーワード一覧
'use client';

import { useState, useEffect, useCallback } from 'react';

type Period = 'week' | 'month' | 'all';

interface MyNode {
  id: string;
  label: string;
  fieldId: string | null;
  fieldName: string | null;
  domainId: string;
  domainName: string;
  domainColor: string;
  relatedTaskCount: number;
  relatedMessageCount: number;
}

interface FieldStat {
  fieldId: string;
  fieldName: string;
  nodeCount: number;
}

interface DomainStat {
  domainId: string;
  domainName: string;
  domainColor: string;
  nodeCount: number;
  fields: FieldStat[];
}

interface MyKeywordsData {
  nodes: MyNode[];
  domainStats: DomainStat[];
  totalNodes: number;
  period: string;
}

interface Props {
  period: Period;
  onPeriodChange: (p: Period) => void;
}

export default function MyKnowledgePanel({ period, onPeriodChange }: Props) {
  const [data, setData] = useState<MyKeywordsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/nodes/my-keywords?period=${period}`);
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
        // 初回はすべて展開
        if (json.data.domainStats) {
          setExpandedDomains(new Set(json.data.domainStats.map((d: DomainStat) => d.domainId)));
        }
      }
    } catch (e) {
      console.error('[MyKnowledgePanel] 取得エラー:', e);
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleDomain = (domainId: string) => {
    setExpandedDomains(prev => {
      const next = new Set(prev);
      if (next.has(domainId)) next.delete(domainId);
      else next.add(domainId);
      return next;
    });
  };

  // ドメインに属するノードを取得
  const getNodesForDomain = (domainId: string): MyNode[] => {
    if (!data) return [];
    return data.nodes.filter(n => n.domainId === domainId);
  };

  // フィールドに属するノードを取得
  const getNodesForField = (domainId: string, fieldId: string): MyNode[] => {
    if (!data) return [];
    return data.nodes.filter(n => n.domainId === domainId && (n.fieldId || 'uncategorized') === fieldId);
  };

  const periodLabels: Record<Period, string> = {
    week: '週間',
    month: '月間',
    all: '全期間',
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <span className="text-base">📚</span> マイナレッジ
          {data && (
            <span className="text-[10px] text-slate-400 font-normal ml-1">
              {data.totalNodes}キーワード
            </span>
          )}
        </h3>
        <div className="flex gap-1">
          {(['week', 'month', 'all'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              className={`px-2.5 py-1 text-[11px] rounded-full transition-colors ${
                period === p
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 w-24 bg-slate-200 rounded mb-2" />
              <div className="flex gap-2">
                <div className="h-5 w-16 bg-slate-100 rounded" />
                <div className="h-5 w-20 bg-slate-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : !data || data.totalNodes === 0 ? (
        <p className="text-xs text-slate-400 py-6 text-center">
          {period === 'all'
            ? 'まだナレッジが蓄積されていません。タスクやメッセージのAI会話を進めるとキーワードが自動的に蓄積されます。'
            : `${periodLabels[period]}のキーワードはまだありません。`
          }
        </p>
      ) : (
        <div className="space-y-1">
          {data.domainStats.map(domain => {
            const isExpanded = expandedDomains.has(domain.domainId);
            const domainNodes = getNodesForDomain(domain.domainId);
            const hasFields = domain.fields.some(f => f.fieldId !== 'uncategorized');

            return (
              <div key={domain.domainId} className="border border-slate-100 rounded-lg overflow-hidden">
                {/* ドメインヘッダー */}
                <button
                  onClick={() => toggleDomain(domain.domainId)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 transition-colors text-left"
                >
                  <span
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: domain.domainColor }}
                  />
                  <span className="text-xs font-medium text-slate-700 flex-1">
                    {domain.domainName}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {domain.nodeCount}
                  </span>
                  <svg
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* 展開時の内容 */}
                {isExpanded && (
                  <div className="px-3 pb-2">
                    {hasFields ? (
                      // フィールドごとにグループ化
                      domain.fields.map(field => {
                        const fieldNodes = getNodesForField(domain.domainId, field.fieldId);
                        if (fieldNodes.length === 0) return null;
                        return (
                          <div key={field.fieldId} className="mb-2 last:mb-0">
                            {field.fieldId !== 'uncategorized' && (
                              <div className="text-[10px] text-slate-400 font-medium mb-1 pl-1">
                                {field.fieldName}
                              </div>
                            )}
                            <div className="flex flex-wrap gap-1.5">
                              {fieldNodes.map(node => (
                                <NodeChip key={node.id} node={node} />
                              ))}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      // フィールドなし → フラットに表示
                      <div className="flex flex-wrap gap-1.5">
                        {domainNodes.map(node => (
                          <NodeChip key={node.id} node={node} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NodeChip({ node }: { node: MyNode }) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetail(!showDetail)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors border border-slate-100"
      >
        <span>{node.label}</span>
        {node.relatedTaskCount > 0 && (
          <span className="text-[9px] bg-blue-50 text-blue-600 px-1 rounded">
            {node.relatedTaskCount}
          </span>
        )}
        {node.relatedMessageCount > 0 && (
          <span className="text-[9px] bg-green-50 text-green-600 px-1 rounded">
            {node.relatedMessageCount}
          </span>
        )}
      </button>

      {showDetail && (
        <div className="absolute z-10 top-full mt-1 left-0 bg-white border border-slate-200 rounded-lg shadow-lg p-2.5 min-w-[160px]">
          <div className="text-xs font-medium text-slate-700 mb-1">{node.label}</div>
          <div className="space-y-0.5 text-[10px] text-slate-500">
            {node.fieldName && <div>分野: {node.fieldName}</div>}
            <div>領域: {node.domainName}</div>
            {node.relatedTaskCount > 0 && (
              <div className="text-blue-600">関連タスク/種: {node.relatedTaskCount}件</div>
            )}
            {node.relatedMessageCount > 0 && (
              <div className="text-green-600">関連メッセージ: {node.relatedMessageCount}件</div>
            )}
          </div>
          <button
            onClick={() => setShowDetail(false)}
            className="mt-1.5 text-[10px] text-slate-400 hover:text-slate-600"
          >
            閉じる
          </button>
        </div>
      )}
    </div>
  );
}
