// Phase 46+47+57: ナレッジ — 個人知識地図 + CRUD UI + 未確認ノード管理 + 提案履歴
'use client';

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/shared/AppLayout';
import ContextBar from '@/components/shared/ContextBar';
import DomainTree from '@/components/master/DomainTree';
import MasterStats from '@/components/master/MasterStats';
import UnconfirmedPanel from '@/components/master/UnconfirmedPanel';
import ThisWeekTagCloud from '@/components/master/ThisWeekTagCloud';
import MyKnowledgePanel from '@/components/master/MyKnowledgePanel';
import { LoadingState } from '@/components/ui/EmptyState';
import type { KnowledgeHierarchy } from '@/lib/types';

interface DomainStat {
  domainId: string;
  domainName: string;
  color: string;
  nodeCount: number;
  fieldCount: number;
}

interface ProposalHistoryItem {
  id: string;
  status: string;
  entryCount: number;
  clusteringConfidence: number;
  proposalWeek: string;
  createdAt: string;
  appliedAt: string | null;
}

type MasterTab = 'hierarchy' | 'proposals';
type Period = 'week' | 'month' | 'all';

export default function MasterPage() {
  const [hierarchy, setHierarchy] = useState<KnowledgeHierarchy | null>(null);
  const [stats, setStats] = useState<DomainStat[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MasterTab>('hierarchy');
  const [proposals, setProposals] = useState<ProposalHistoryItem[]>([]);
  const [pendingProposalCount, setPendingProposalCount] = useState(0);
  const [knowledgePeriod, setKnowledgePeriod] = useState<Period>('all');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [hierRes, statsRes, proposalsRes] = await Promise.all([
        fetch('/api/master'),
        fetch('/api/master/domains'),
        fetch('/api/knowledge/proposals').catch(() => null),
      ]);
      const hierData = await hierRes.json();
      const domainsData = await statsRes.json();

      if (hierData.success) {
        setHierarchy(hierData.data);
        const domainStats: DomainStat[] = hierData.data.domains.map(
          (d: KnowledgeHierarchy['domains'][0]) => ({
            domainId: d.id,
            domainName: d.name,
            color: d.color,
            nodeCount: d.fields.reduce(
              (sum: number, f: KnowledgeHierarchy['domains'][0]['fields'][0]) => sum + f.nodeCount,
              0
            ),
            fieldCount: d.fields.length,
          })
        );
        setStats(domainStats);
      }

      // 提案データ
      if (proposalsRes) {
        const proposalsData = await proposalsRes.json();
        if (proposalsData.success && proposalsData.data) {
          const items = proposalsData.data.map((p: Record<string, unknown>) => ({
            id: p.id as string,
            status: p.status as string,
            entryCount: p.entryCount as number,
            clusteringConfidence: p.clusteringConfidence as number,
            proposalWeek: p.proposalWeek as string,
            createdAt: p.createdAt as string,
            appliedAt: (p.appliedAt as string) || null,
          }));
          setProposals(items);
          setPendingProposalCount(items.filter((p: ProposalHistoryItem) => p.status === 'pending').length);
        }
      }

      void domainsData;
    } catch {
      // エラーハンドリング
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <AppLayout>
      <ContextBar
        title="ナレッジ"
        subtitle="個人の知識地図 — タスク・メッセージから蓄積されたキーワード"
      >
        {!isLoading && (
          <div className="relative w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="キーワード・分野・領域を検索..."
              className="w-full px-3 py-1.5 pl-8 border border-slate-200 rounded-lg text-xs
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                placeholder:text-slate-400 bg-white"
            />
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        )}
      </ContextBar>

      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
          {isLoading ? (
            <LoadingState />
          ) : (
            <>
              {/* Phase 57: 今週のタグクラウド */}
              <ThisWeekTagCloud />

              {/* Phase 57: マイナレッジパネル */}
              <MyKnowledgePanel
                period={knowledgePeriod}
                onPeriodChange={setKnowledgePeriod}
              />

              {/* 未確認ノードパネル */}
              <UnconfirmedPanel onConfirmed={fetchData} />

              {/* タブ切り替え（管理用） */}
              <div className="flex gap-1 border-b border-slate-200">
                <button
                  onClick={() => setActiveTab('hierarchy')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'hierarchy'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  階層構造（管理）
                </button>
                <button
                  onClick={() => setActiveTab('proposals')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                    activeTab === 'proposals'
                      ? 'border-purple-500 text-purple-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  AI提案履歴
                  {pendingProposalCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[10px] font-bold">
                      {pendingProposalCount}
                    </span>
                  )}
                </button>
              </div>

              {activeTab === 'hierarchy' && (
                <>
                  {/* 統計カード */}
                  {hierarchy && (
                    <MasterStats
                      stats={stats}
                      totalEntries={hierarchy.totalEntries}
                      unclassifiedCount={hierarchy.unclassifiedCount}
                    />
                  )}

                  {/* ツリー表示（CRUD対応） */}
                  {hierarchy && (
                    <DomainTree
                      hierarchy={hierarchy}
                      searchQuery={searchQuery}
                      onDataChanged={fetchData}
                    />
                  )}
                </>
              )}

              {activeTab === 'proposals' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500">
                    AIが週次で蓄積されたキーワードを分析し、領域/分野の構造を自動提案します。
                    秘書チャットの「ナレッジ提案」から確認・承認できます。
                  </p>
                  {proposals.length === 0 ? (
                    <div className="text-center py-12 text-sm text-slate-400">
                      まだ提案履歴はありません。キーワードが蓄積されると自動的に提案が生成されます。
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {proposals.map((p) => (
                        <div
                          key={p.id}
                          className="border border-slate-200 rounded-lg p-4 bg-white hover:shadow-sm transition-shadow"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium text-slate-700">
                                {p.proposalWeek || '不明'}
                              </span>
                              <span className="text-xs text-slate-500">
                                {p.entryCount}個のキーワード
                              </span>
                              <span className="text-xs text-slate-400">
                                信頼度 {Math.round((p.clusteringConfidence || 0) * 100)}%
                              </span>
                            </div>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              p.status === 'approved' ? 'bg-green-100 text-green-700' :
                              p.status === 'rejected' ? 'bg-red-100 text-red-700' :
                              p.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {p.status === 'approved' ? '承認済み' :
                               p.status === 'rejected' ? '却下' :
                               p.status === 'pending' ? '待機中' :
                               p.status}
                            </span>
                          </div>
                          <div className="mt-1 text-[10px] text-slate-400">
                            作成: {new Date(p.createdAt).toLocaleString('ja-JP')}
                            {p.appliedAt && ` / 適用: ${new Date(p.appliedAt).toLocaleString('ja-JP')}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </AppLayout>
  );
}
