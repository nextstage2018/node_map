// v3.3: プロジェクトメンバー管理コンポーネント
// project_members テーブル経由。空なら組織メンバーにフォールバック
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, UserPlus, Search, X, Trash2 } from 'lucide-react';

interface ProjectMember {
  id: string | null;
  contact_id: string;
  role: string;
  is_fallback?: boolean;
  contact: {
    id: string;
    name: string;
    relationship_type: string | null;
    main_channel: string | null;
    message_count: number | null;
    last_contact_at: string | null;
    is_team_member: boolean | null;
    company_name: string | null;
    linked_user_id: string | null;
  };
}

interface Contact {
  id: string;
  name: string;
  companyName?: string;
}

interface Props {
  projectId: string;
  projectName: string;
}

export default function ProjectMembers({ projectId, projectName }: Props) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFallback, setIsFallback] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const fetchMembers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/members`);
      const data = await res.json();
      if (data.success) {
        setMembers(data.data || []);
        setIsFallback(!!data.fallback);
      }
    } catch { /* */ }
    setIsLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const fetchContacts = async () => {
    try {
      const res = await fetch('/api/contacts');
      const data = await res.json();
      if (data.success) {
        const memberContactIds = new Set(members.map(m => m.contact_id));
        const mapped = (data.data || [])
          .filter((c: Record<string, unknown>) => !memberContactIds.has(c.id as string))
          .map((c: Record<string, unknown>) => ({
            id: c.id as string,
            name: c.name as string,
            companyName: c.companyName as string | undefined,
          }));
        setAllContacts(mapped);
      }
    } catch { /* */ }
  };

  useEffect(() => {
    if (showAddForm) fetchContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddForm]);

  const addMember = async (contactId: string) => {
    try {
      // auto_ コンタクトの場合はname情報も送信
      const contact = allContacts.find(c => c.id === contactId);
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: contactId,
          name: contact?.name,
          companyName: contact?.companyName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg('success', 'メンバーを追加しました');
        fetchMembers();
        setAllContacts(prev => prev.filter(c => c.id !== contactId));
      } else {
        showMsg('error', data.error || '追加に失敗しました');
      }
    } catch {
      showMsg('error', '通信エラー');
    }
  };

  const removeMember = async (memberId: string | null, contactId: string) => {
    if (!confirm('このメンバーをプロジェクトから外しますか？')) return;
    try {
      const param = memberId ? `memberId=${memberId}` : `contactId=${contactId}`;
      const res = await fetch(`/api/projects/${projectId}/members?${param}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showMsg('success', 'メンバーを外しました');
        fetchMembers();
      }
    } catch {
      showMsg('error', '通信エラー');
    }
  };

  const filteredContacts = allContacts.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.companyName || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const roleBadge = (role: string) => {
    const config: Record<string, { label: string; class: string }> = {
      owner: { label: 'オーナー', class: 'bg-blue-50 text-blue-700' },
      member: { label: 'メンバー', class: 'bg-slate-100 text-slate-600' },
      viewer: { label: '閲覧者', class: 'bg-slate-50 text-slate-500' },
    };
    const c = config[role] || config.member;
    return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${c.class}`}>{c.label}</span>;
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center py-16">
        <div className="animate-spin text-2xl">&#8987;</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-slate-800">{projectName} - メンバー</h2>
          {isFallback && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
              組織メンバーを表示中
            </span>
          )}
        </div>
        <button
          onClick={() => { setShowAddForm(!showAddForm); setSearchQuery(''); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <UserPlus className="w-3.5 h-3.5" />追加
        </button>
      </div>

      {message && (
        <div className={`px-3 py-2 rounded-lg text-xs font-medium ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>{message.text}</div>
      )}

      {isFallback && (
        <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          プロジェクト専用のメンバー設定がないため、組織メンバーを表示しています。「追加」からプロジェクトメンバーを個別設定できます。
        </div>
      )}

      {showAddForm && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">コンタクトから追加</h3>
            <button onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="コンタクトを検索..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="max-h-60 overflow-y-auto space-y-1">
            {filteredContacts.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">該当するコンタクトがありません</p>
            ) : filteredContacts.slice(0, 50).map(c => (
              <div key={c.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-white transition-colors">
                <div>
                  <span className="text-sm text-slate-700">{c.name}</span>
                  {c.companyName && <span className="ml-2 text-[10px] text-slate-400">{c.companyName}</span>}
                </div>
                <button
                  onClick={() => addMember(c.id)}
                  className="px-2 py-1 text-[10px] font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                >追加</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {members.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-slate-400">
          <div className="text-center">
            <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs">メンバーがいません</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m, idx) => (
            <div key={m.id || `fb-${idx}`} className="p-3 bg-white border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                    {m.contact.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700">{m.contact.name}</span>
                      {roleBadge(m.role)}
                      {m.contact.company_name && (
                        <span className="text-[10px] text-slate-400">{m.contact.company_name}</span>
                      )}
                    </div>
                    {m.contact.last_contact_at && (
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        最終: {new Date(m.contact.last_contact_at).toLocaleDateString('ja-JP')}
                      </p>
                    )}
                  </div>
                </div>
                {!isFallback && (
                  <button
                    onClick={() => removeMember(m.id, m.contact_id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="外す"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
