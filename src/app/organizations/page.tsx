// Phase UI-7: 組織一覧ページ（カード形式 + PJ数・メンバー数表示）
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Plus, Users, Globe, X, Search, FolderOpen } from 'lucide-react';
import AppLayout from '@/components/shared/AppLayout';
import ContextBar from '@/components/shared/ContextBar';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import EmptyState, { LoadingState } from '@/components/ui/EmptyState';

// ========================================
// 型定義
// ========================================
interface Organization {
  id: string;
  name: string;
  domain: string | null;
  relationship_type: string | null;
  created_at: string;
  updated_at: string;
}

interface OrgWithCounts extends Organization {
  contactCount: number;
  projectCount: number;
}

const REL_TYPE_LABELS: Record<string, { label: string; labelColor: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'slate' }> = {
  internal: { label: '自社', labelColor: 'blue' },
  client: { label: '取引先', labelColor: 'yellow' },
  partner: { label: 'パートナー', labelColor: 'purple' },
  vendor: { label: '仕入先', labelColor: 'green' },
  prospect: { label: '見込み', labelColor: 'slate' },
};

// 頭文字アイコンの背景色
const INITIAL_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-indigo-100 text-indigo-700',
];

function getInitialColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return INITIAL_COLORS[Math.abs(hash) % INITIAL_COLORS.length];
}

function getInitial(name: string): string {
  // 日本語の場合は最初の1文字、英語の場合は最初の2文字
  const trimmed = name.trim();
  if (/^[a-zA-Z]/.test(trimmed)) {
    const words = trimmed.split(/\s+/);
    return words.length >= 2
      ? (words[0][0] + words[1][0]).toUpperCase()
      : trimmed.substring(0, 2).toUpperCase();
  }
  // 「株式会社」「有限会社」等のプレフィックスをスキップ
  const cleaned = trimmed.replace(/^(株式会社|有限会社|合同会社|合資会社)\s*/, '');
  return (cleaned || trimmed).charAt(0);
}

// ========================================
// メインコンポーネント
// ========================================
export default function OrganizationsPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<OrgWithCounts[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  // 新規作成フォーム
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDomain, setNewDomain] = useState('');

  // メッセージ
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  // ========================================
  // データ取得（組織 + コンタクト数 + PJ数）
  // ========================================
  const fetchOrganizations = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);

      const [orgRes, contactsRes, projectsRes] = await Promise.all([
        fetch(`/api/organizations?${params}`),
        fetch('/api/contacts'),
        fetch('/api/projects'),
      ]);

      const orgData = await orgRes.json();
      const contactsData = await contactsRes.json();
      const projectsData = await projectsRes.json();

      if (orgData.success) {
        const orgs: Organization[] = orgData.data || [];
        const contacts = contactsData.success ? contactsData.data || [] : [];
        const projects = projectsData.success ? projectsData.data || [] : [];

        const orgsWithCounts: OrgWithCounts[] = orgs.map((org) => ({
          ...org,
          contactCount: contacts.filter(
            (c: { companyName?: string }) => c.companyName === org.name
          ).length,
          projectCount: projects.filter(
            (p: { organization_id?: string }) => p.organization_id === org.id
          ).length,
        }));

        setOrganizations(orgsWithCounts);
      }
    } catch { /* ignore */ }
    finally { setIsLoading(false); }
  }, [search]);

  useEffect(() => { fetchOrganizations(); }, [fetchOrganizations]);

  // ========================================
  // 組織作成
  // ========================================
  const createOrganization = async () => {
    if (!newName.trim()) return;
    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), domain: newDomain.trim() || null }),
      });
      const data = await res.json();
      if (data.success) {
        setShowForm(false);
        setNewName('');
        setNewDomain('');
        fetchOrganizations();
        showMsg('success', '組織を作成しました');
      } else {
        showMsg('error', data.error || '作成に失敗しました');
      }
    } catch { showMsg('error', '通信エラー'); }
  };

  return (
    <AppLayout>
      <ContextBar
        title="組織"
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="組織名・ドメインで検索..."
                className="pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setShowForm(!showForm)}
            >
              新規作成
            </Button>
          </div>
        }
      />
      <div className="flex-1 overflow-hidden flex flex-col">

        {/* メッセージバナー */}
        {message && (
          <div className={`mx-6 mt-4 px-3 py-2 rounded-lg text-xs font-medium ${
            message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* 新規作成フォーム */}
        {showForm && (
          <div className="mx-6 mt-4">
            <Card variant="outlined" padding="md">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700">新しい組織を追加</h3>
                <button onClick={() => { setShowForm(false); setNewName(''); setNewDomain(''); }} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1">
                    <Building2 className="w-3.5 h-3.5" />
                    組織名
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="例: 株式会社ネクストステージ"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1">
                    <Globe className="w-3.5 h-3.5" />
                    ドメイン（任意）
                  </label>
                  <input
                    type="text"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    placeholder="例: nextstage.co.jp"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => { setShowForm(false); setNewName(''); setNewDomain(''); }}
                  >
                    キャンセル
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={createOrganization}
                    disabled={!newName.trim()}
                  >
                    作成
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* メインコンテンツ: 組織カード一覧 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <LoadingState />
          ) : organizations.length === 0 ? (
            <EmptyState
              icon={<Building2 className="w-12 h-12" />}
              title="組織がありません"
              description="「新規作成」ボタンで最初の組織を登録しましょう"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {organizations.map((org) => {
                const relConfig = org.relationship_type ? REL_TYPE_LABELS[org.relationship_type] : null;
                return (
                  <Card
                    key={org.id}
                    variant="interactive"
                    padding="md"
                    onClick={() => router.push(`/organizations/${org.id}`)}
                  >
                    <div className="flex items-start gap-3">
                      {/* 頭文字アイコン */}
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-base font-bold ${getInitialColor(org.name)}`}>
                        {getInitial(org.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-slate-900 truncate">{org.name}</h3>
                          {relConfig && (
                            <Badge label={relConfig.label} labelColor={relConfig.labelColor} size="xs" />
                          )}
                        </div>
                        {org.domain && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Globe className="w-3 h-3 text-slate-400" />
                            <span className="text-xs text-slate-500">{org.domain}</span>
                          </div>
                        )}
                        {/* PJ数・メンバー数 */}
                        <div className="flex items-center gap-3 mt-2">
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
                            {org.projectCount} PJ
                          </span>
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            {org.contactCount}人
                          </span>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
