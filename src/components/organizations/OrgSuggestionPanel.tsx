// Phase 60: 組織自動提案パネル
// メールドメインから未登録組織を自動検出し、候補カードとして表示
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Building2, Users, Mail, MessageSquare, ChevronDown, ChevronUp, Loader2, Sparkles } from 'lucide-react';

interface OrgCandidate {
  domain: string;
  suggestedName: string;
  contactCount: number;
  messageCount: number;
  contactIds: string[];
  channels: Array<{
    serviceName: string;
    channelId: string;
    channelName: string;
  }>;
  suggestedRelationship: 'client' | 'partner' | 'vendor' | 'prospect';
  confidence: number;
}

const REL_OPTIONS: { value: string; label: string }[] = [
  { value: 'client', label: '取引先' },
  { value: 'partner', label: 'パートナー' },
  { value: 'vendor', label: '仕入先' },
  { value: 'prospect', label: '見込み' },
];

interface Props {
  onOrgCreated: () => void; // 組織作成後のリフレッシュコールバック
}

export default function OrgSuggestionPanel({ onOrgCreated }: Props) {
  const [candidates, setCandidates] = useState<OrgCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState<string | null>(null);
  const [created, setCreated] = useState<Set<string>>(new Set());
  const [relationships, setRelationships] = useState<Record<string, string>>({});
  const [editingNames, setEditingNames] = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState(false);

  const fetchCandidates = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/organizations/auto-setup');
      const data = await res.json();
      if (data.success && data.data) {
        setCandidates(data.data);
        // 関係性の初期値を設定
        const rels: Record<string, string> = {};
        const names: Record<string, string> = {};
        for (const c of data.data) {
          rels[c.domain] = c.suggestedRelationship;
          names[c.domain] = c.suggestedName;
        }
        setRelationships(rels);
        setEditingNames(names);
      }
    } catch {
      // エラーは無視
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  const handleCreate = async (candidate: OrgCandidate) => {
    setCreating(candidate.domain);
    try {
      const res = await fetch('/api/organizations/auto-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingNames[candidate.domain] || candidate.suggestedName,
          domain: candidate.domain,
          relationshipType: relationships[candidate.domain] || candidate.suggestedRelationship,
          contactIds: candidate.contactIds,
          channels: candidate.channels,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCreated(prev => new Set([...prev, candidate.domain]));
        onOrgCreated();
      }
    } catch {
      // エラーは無視
    } finally {
      setCreating(null);
    }
  };

  const handleSkip = (domain: string) => {
    setSkipped(prev => new Set([...prev, domain]));
  };

  // 表示する候補（スキップ・作成済みを除外）
  const visibleCandidates = candidates.filter(
    c => !skipped.has(c.domain) && !created.has(c.domain)
  );

  // 候補がないまたはローディング中
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">候補を検出中...</span>
      </div>
    );
  }

  if (visibleCandidates.length === 0) {
    return null; // 候補なし → パネル自体を非表示
  }

  const channelIcon = (serviceName: string) => {
    switch (serviceName) {
      case 'email': return <Mail className="w-3 h-3" />;
      case 'slack': return <MessageSquare className="w-3 h-3" />;
      case 'chatwork': return <MessageSquare className="w-3 h-3" />;
      default: return null;
    }
  };

  return (
    <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-4">
      {/* ヘッダー */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-bold text-slate-800">
            組織の登録候補
          </h3>
          <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full font-medium">
            {visibleCandidates.length}件
          </span>
        </div>
        {collapsed ? (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {!collapsed && (
        <>
          <p className="text-xs text-slate-500 mt-1 mb-3">
            メール履歴から未登録の組織を検出しました。内容を確認して登録してください。
          </p>

          <div className="space-y-3">
            {visibleCandidates.map((candidate) => (
              <div
                key={candidate.domain}
                className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm"
              >
                {/* 組織名（編集可能） */}
                <div className="mb-2">
                  <input
                    type="text"
                    value={editingNames[candidate.domain] || candidate.suggestedName}
                    onChange={(e) =>
                      setEditingNames(prev => ({ ...prev, [candidate.domain]: e.target.value }))
                    }
                    className="text-sm font-bold text-slate-900 w-full border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none pb-0.5 bg-transparent"
                  />
                  <span className="text-xs text-slate-400">{candidate.domain}</span>
                </div>

                {/* メタ情報 */}
                <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {candidate.contactCount}人
                  </span>
                  <span className="flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    {candidate.messageCount}通
                  </span>
                  {candidate.channels.length > 0 && (
                    <span className="flex items-center gap-1">
                      {candidate.channels.map((ch, i) => (
                        <span key={i} className="flex items-center gap-0.5" title={ch.channelName}>
                          {channelIcon(ch.serviceName)}
                        </span>
                      ))}
                    </span>
                  )}
                </div>

                {/* 関係性選択 + ボタン */}
                <div className="flex items-center gap-2">
                  <select
                    value={relationships[candidate.domain] || candidate.suggestedRelationship}
                    onChange={(e) =>
                      setRelationships(prev => ({ ...prev, [candidate.domain]: e.target.value }))
                    }
                    className="text-xs border border-slate-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {REL_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>

                  <div className="flex-1" />

                  <button
                    onClick={() => handleSkip(candidate.domain)}
                    className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1"
                  >
                    スキップ
                  </button>

                  <button
                    onClick={() => handleCreate(candidate)}
                    disabled={creating === candidate.domain}
                    className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg px-3 py-1.5 flex items-center gap-1"
                  >
                    {creating === candidate.domain ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Building2 className="w-3 h-3" />
                    )}
                    登録する
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
