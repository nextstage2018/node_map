'use client';

import { useState } from 'react';
import type { KnowledgeHierarchy } from '@/lib/types';

interface DomainTreeProps {
  hierarchy: KnowledgeHierarchy;
  searchQuery: string;
}

export default function DomainTree({ hierarchy, searchQuery }: DomainTreeProps) {
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(
    new Set(hierarchy.domains.map((d) => d.id))
  );
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());

  const toggleDomain = (id: string) => {
    setExpandedDomains((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleField = (id: string) => {
    setExpandedFields((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const q = searchQuery.toLowerCase();

  return (
    <div className="space-y-2">
      {hierarchy.domains.map((domain) => {
        // 検索フィルター
        const filteredFields = domain.fields
          .map((field) => {
            const filteredEntries = field.entries.filter((e) =>
              !q ||
              e.label.toLowerCase().includes(q) ||
              e.synonyms.some((s) => s.toLowerCase().includes(q))
            );
            if (!q || field.name.toLowerCase().includes(q) || filteredEntries.length > 0) {
              return { ...field, entries: q ? filteredEntries : field.entries };
            }
            return null;
          })
          .filter(Boolean) as typeof domain.fields;

        if (q && filteredFields.length === 0 && !domain.name.toLowerCase().includes(q)) {
          return null;
        }

        const isExpanded = expandedDomains.has(domain.id);
        const totalNodes = domain.fields.reduce((sum, f) => sum + f.nodeCount, 0);

        return (
          <div key={domain.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* 領域ヘッダー */}
            <button
              onClick={() => toggleDomain(domain.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
            >
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: domain.color }}
              />
              <div className="flex-1 text-left">
                <span className="font-medium text-slate-900">{domain.name}</span>
                <span className="ml-2 text-xs text-slate-400">{domain.description}</span>
              </div>
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                {totalNodes}ノード
              </span>
              <svg
                className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* 分野一覧 */}
            {isExpanded && (
              <div className="border-t border-slate-100">
                {(q ? filteredFields : domain.fields).map((field) => {
                  const fieldExpanded = expandedFields.has(field.id);
                  return (
                    <div key={field.id} className="border-b border-slate-50 last:border-b-0">
                      <button
                        onClick={() => toggleField(field.id)}
                        className="w-full flex items-center gap-2 px-6 py-2.5 hover:bg-slate-50 transition-colors"
                      >
                        <svg
                          className={`w-3 h-3 text-slate-400 transition-transform ${fieldExpanded ? 'rotate-90' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-sm font-medium text-slate-700">{field.name}</span>
                        <span className="text-xs text-slate-400">{field.description}</span>
                        <span className="ml-auto text-xs text-slate-400">
                          {field.entries.length}件 / {field.nodeCount}ノード
                        </span>
                      </button>

                      {/* マスタキーワード一覧 */}
                      {fieldExpanded && field.entries.length > 0 && (
                        <div className="px-8 pb-2 space-y-1">
                          {field.entries.map((entry) => (
                            <div
                              key={entry.id}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 text-sm"
                            >
                              <span className="text-slate-700 font-medium">{entry.label}</span>
                              {entry.synonyms.length > 0 && (
                                <span className="text-xs text-slate-400">
                                  ({entry.synonyms.slice(0, 3).join(', ')}
                                  {entry.synonyms.length > 3 && ` +${entry.synonyms.length - 3}`})
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
