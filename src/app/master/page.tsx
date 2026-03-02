// Phase 46: ナレッジ — CRUD UI + 未確認ノード管理 + キーワード詳細
'use client';

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/shared/AppLayout';
import ContextBar from '@/components/shared/ContextBar';
import DomainTree from '@/components/master/DomainTree';
import MasterStats from '@/components/master/MasterStats';
import UnconfirmedPanel from '@/components/master/UnconfirmedPanel';
import { LoadingState } from '@/components/ui/EmptyState';
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

  const fetchData = useCallback(async () => {
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
        subtitle="組織共通の知識分類体系（領域 → 分野 → キーワード）"
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
              {/* 未確認ノードパネル */}
              <UnconfirmedPanel onConfirmed={fetchData} />

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
        </div>
      </main>
    </AppLayout>
  );
}
