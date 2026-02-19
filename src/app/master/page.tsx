'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/shared/Header';
import DomainTree from '@/components/master/DomainTree';
import MasterStats from '@/components/master/MasterStats';
import type { KnowledgeHierarchy } from '@/lib/types';

interface DomainStat {
  domainId: string;
  domainName: string;
  color: string;
  nodeCount: number;
  fieldCount: number;
}

export default function MasterPage() {
  const [hierarchy, setHierarchy] = useState<KnowledgeHierarchy | null>(null);
  const [stats, setStats] = useState<DomainStat[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [hierRes, statsRes] = await Promise.all([
          fetch('/api/master'),
          fetch('/api/master/domains'),
        ]);
        const hierData = await hierRes.json();
        const domainsData = await statsRes.json();

        if (hierData.success) {
          setHierarchy(hierData.data);
          // 統計を階層データから計算
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

        // domainsDataは将来の拡張用（個別操作時）
        void domainsData;
      } catch {
        // エラーハンドリング
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <Header />

      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
          {/* ページタイトル */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">ナレッジマスタ</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                組織共通の知識分類体系（領域 → 分野 → キーワード）
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <>
              {/* 統計カード */}
              {hierarchy && (
                <MasterStats
                  stats={stats}
                  totalEntries={hierarchy.totalEntries}
                  unclassifiedCount={hierarchy.unclassifiedCount}
                />
              )}

              {/* 検索 */}
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="キーワード・分野・領域を検索..."
                  className="w-full px-4 py-2.5 pl-10 border border-slate-200 rounded-xl text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                    placeholder:text-slate-400 bg-white"
                />
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              {/* ツリー表示 */}
              {hierarchy && (
                <DomainTree hierarchy={hierarchy} searchQuery={searchQuery} />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
