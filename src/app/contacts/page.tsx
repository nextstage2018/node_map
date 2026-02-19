'use client';

import Header from '@/components/shared/Header';
import ContactList from '@/components/contacts/ContactList';
import ContactStats from '@/components/contacts/ContactStats';
import { useContacts } from '@/hooks/useContacts';
import { RELATIONSHIP_TYPE_CONFIG, CHANNEL_CONFIG } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { PersonRelationshipType, ChannelType } from '@/lib/types';

export default function ContactsPage() {
  const {
    contacts,
    stats,
    isLoading,
    filterRelationship,
    filterChannel,
    searchQuery,
    setFilterRelationship,
    setFilterChannel,
    setSearchQuery,
    updateRelationship,
  } = useContacts();

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <Header />

      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
          {/* ページタイトル */}
          <div>
            <h2 className="text-xl font-bold text-slate-900">コンタクト</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              メッセージの送受信者を統合管理。関係属性（自社/クライアント/パートナー）をAIが自動推定します。
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <>
              {/* 統計カード */}
              {stats && <ContactStats stats={stats} />}

              {/* フィルターバー */}
              <div className="flex flex-wrap gap-4 items-center">
                {/* 検索 */}
                <div className="relative flex-1 min-w-[200px]">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="名前・アドレスで検索..."
                    className="w-full px-4 py-2 pl-10 border border-slate-200 rounded-xl text-sm
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

                {/* 関係属性フィルター */}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setFilterRelationship(null)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                      !filterRelationship
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-slate-50 text-slate-500 border border-slate-100 hover:bg-slate-100'
                    )}
                  >
                    すべて
                  </button>
                  {(Object.entries(RELATIONSHIP_TYPE_CONFIG) as [PersonRelationshipType, typeof RELATIONSHIP_TYPE_CONFIG[keyof typeof RELATIONSHIP_TYPE_CONFIG]][]).map(
                    ([key, cfg]) => (
                      <button
                        key={key}
                        onClick={() =>
                          setFilterRelationship(filterRelationship === key ? null : key)
                        }
                        className={cn(
                          'flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                          filterRelationship === key
                            ? `${cfg.bgColor} ${cfg.textColor} border ${cfg.borderColor}`
                            : 'bg-slate-50 text-slate-500 border border-slate-100 hover:bg-slate-100'
                        )}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor}`} />
                        {cfg.label}
                      </button>
                    )
                  )}
                </div>

                {/* チャネルフィルター */}
                <div className="flex gap-1.5">
                  {(Object.entries(CHANNEL_CONFIG) as [ChannelType, typeof CHANNEL_CONFIG[keyof typeof CHANNEL_CONFIG]][]).map(
                    ([key, cfg]) => (
                      <button
                        key={key}
                        onClick={() =>
                          setFilterChannel(filterChannel === key ? null : key)
                        }
                        className={cn(
                          'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                          filterChannel === key
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-slate-50 text-slate-500 border border-slate-100 hover:bg-slate-100'
                        )}
                      >
                        {cfg.label}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* コンタクト一覧 */}
              <ContactList
                contacts={contacts}
                onRelationshipChange={updateRelationship}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
