// Phase 37: 組織詳細ページ（基本情報・チャネル・メンバー 3タブ）
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Building2, ArrowLeft, Globe, Save, Hash, Mail, MessageSquare,
  Users, UserPlus, Trash2, Search, Wand2, X, Plus, Link2
} from 'lucide-react';
import Header from '@/components/shared/Header';

// ========================================
// 型定義
// ========================================
interface Organization {
  id: string;
  name: string;
  domain: string | null;
  created_at: string;
  updated_at: string;
}

interface OrgChannel {
  id: string;
  organization_id: string;
  service_name: 'slack' | 'chatwork' | 'email';
  channel_id: string;
  channel_name: string;
  channel_type: string | null;
  is_active: boolean;
  created_at: string;
}

interface Member {
  id: string;
  name: string;
  relationship_type: string | null;
  main_channel: string | null;
  message_count: number | null;
  last_contact_at: string | null;
  is_team_member: boolean | null;
  auto_added_to_org: boolean | null;
  confirmed: boolean | null;
}

interface AvailableChannel {
  channel_id: string;
  channel_name: string;
  channel_type: string;
  member_count?: number;
  is_subscribed: boolean;
}

interface Contact {
  id: string;
  name: string;
  companyName?: string;
  organization_id?: string;
}

// ========================================
// サービスアイコン
// ========================================
function ServiceIcon({ service }: { service: string }) {
  switch (service) {
    case 'slack':
      return <Hash className="w-4 h-4 text-purple-600" />;
    case 'chatwork':
      return <MessageSquare className="w-4 h-4 text-green-600" />;
    case 'email':
      return <Mail className="w-4 h-4 text-blue-600" />;
    default:
      return <Link2 className="w-4 h-4 text-slate-400" />;
  }
}

function ServiceBadge({ service }: { service: string }) {
  const config: Record<string, { label: string; bg: string; text: string }> = {
    slack: { label: 'Slack', bg: 'bg-purple-50', text: 'text-purple-700' },
    chatwork: { label: 'Chatwork', bg: 'bg-green-50', text: 'text-green-700' },
    email: { label: 'Email', bg: 'bg-blue-50', text: 'text-blue-700' },
  };
  const c = config[service] || { label: service, bg: 'bg-slate-50', text: 'text-slate-700' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${c.bg} ${c.text}`}>
      <ServiceIcon service={service} />
      {c.label}
    </span>
  );
}

// ========================================
// メインコンポーネント
// ========================================
export default function OrganizationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;

  // タブ
  const [activeTab, setActiveTab] = useState<'info' | 'channels' | 'members'>('info');

  // 組織情報
  const [org, setOrg] = useState<Organization | null>(null);
  const [editName, setEditName] = useState('');
  const [editDomain, setEditDomain] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // チャネル
  const [channels, setChannels] = useState<OrgChannel[]>([]);
  const [showChannelForm, setShowChannelForm] = useState(false);
  const [channelService, setChannelService] = useState<'slack' | 'chatwork' | 'email'>('slack');
  const [availableChannels, setAvailableChannels] = useState<AvailableChannel[]>([]);
  const [channelSearch, setChannelSearch] = useState('');
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [emailDomain, setEmailDomain] = useState('');

  // メンバー
  const [members, setMembers] = useState<Member[]>([]);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [detecting, setDetecting] = useState(false);

  // メッセージ
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  // ========================================
  // データ取得
  // ========================================
  const fetchOrg = useCallback(async () => {
    try {
      const res = await fetch(`/api/organizations`);
      const data = await res.json();
      if (data.success) {
        const found = (data.data || []).find((o: Organization) => o.id === orgId);
        if (found) {
          setOrg(found);
          setEditName(found.name);
          setEditDomain(found.domain || '');
        }
      }
    } catch { /* */ }
  }, [orgId]);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch(`/api/organizations/${orgId}/channels`);
      const data = await res.json();
      if (data.success) setChannels(data.data || []);
    } catch { /* */ }
  }, [orgId]);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/organizations/${orgId}/members`);
      const data = await res.json();
      if (data.success) setMembers(data.data || []);
    } catch { /* */ }
  }, [orgId]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await Promise.all([fetchOrg(), fetchChannels(), fetchMembers()]);
      setIsLoading(false);
    };
    load();
  }, [fetchOrg, fetchChannels, fetchMembers]);

  // ========================================
  // 組織情報の保存
  // ========================================
  const saveOrg = async () => {
    if (!editName.trim()) return;
    try {
      const res = await fetch(`/api/organizations/${orgId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), domain: editDomain.trim() || null }),
      });
      const data = await res.json();
      if (data.success) {
        setOrg(data.data);
        showMsg('success', '組織情報を更新しました');
      } else {
        showMsg('error', data.error || '更新に失敗しました');
      }
    } catch { showMsg('error', '通信エラー'); }
  };

  // ========================================
  // チャネル追加
  // ========================================
  const fetchAvailableChannels = async (service: string) => {
    setLoadingChannels(true);
    try {
      const res = await fetch(`/api/settings/channels/available?service=${service}`);
      const data = await res.json();
      if (data.success) {
        // 既に紐づけ済みのチャネルを除外
        const linkedIds = new Set(channels.filter(c => c.service_name === service).map(c => c.channel_id));
        setAvailableChannels((data.data || []).filter((ch: AvailableChannel) => !linkedIds.has(ch.channel_id)));
      }
    } catch { /* */ }
    setLoadingChannels(false);
  };

  const addChannel = async (channelId: string, channelName: string, channelType: string) => {
    try {
      const res = await fetch(`/api/organizations/${orgId}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_name: channelService,
          channel_id: channelId,
          channel_name: channelName,
          channel_type: channelType,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg('success', `${channelName} を追加しました`);
        fetchChannels();
        // 追加したチャネルをリストから除外
        setAvailableChannels(prev => prev.filter(c => c.channel_id !== channelId));
      } else {
        showMsg('error', data.error || '追加に失敗しました');
      }
    } catch { showMsg('error', '通信エラー'); }
  };

  const addEmailDomain = async () => {
    const domain = emailDomain.trim().replace(/^@/, '');
    if (!domain) return;
    await addChannel(`@${domain}`, `@${domain}`, 'domain');
    setEmailDomain('');
  };

  const removeChannel = async (channelDbId: string) => {
    if (!confirm('このチャネルの紐づけを解除しますか？')) return;
    try {
      const res = await fetch(`/api/organizations/${orgId}/channels?channelId=${channelDbId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showMsg('success', 'チャネルを解除しました');
        fetchChannels();
      }
    } catch { showMsg('error', '通信エラー'); }
  };

  // ========================================
  // メンバー追加
  // ========================================
  const fetchAllContacts = async () => {
    try {
      const res = await fetch('/api/contacts');
      const data = await res.json();
      if (data.success) {
        // 既にこの組織のメンバーを除外
        const memberIds = new Set(members.map(m => m.id));
        setAllContacts((data.data || []).filter((c: Contact) => !memberIds.has(c.id)));
      }
    } catch { /* */ }
  };

  const addMember = async (contactId: string) => {
    try {
      const res = await fetch(`/api/organizations/${orgId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_ids: [contactId] }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg('success', 'メンバーを追加しました');
        fetchMembers();
        setAllContacts(prev => prev.filter(c => c.id !== contactId));
      }
    } catch { showMsg('error', '通信エラー'); }
  };

  const removeMember = async (contactId: string) => {
    if (!confirm('このメンバーを組織から外しますか？')) return;
    try {
      const res = await fetch(`/api/organizations/${orgId}/members?contactId=${contactId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showMsg('success', 'メンバーを外しました');
        fetchMembers();
      }
    } catch { showMsg('error', '通信エラー'); }
  };

  // ========================================
  // メンバー自動検出
  // ========================================
  const detectMembers = async () => {
    setDetecting(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/detect-members`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const { detected, added } = data.data;
        showMsg('success', data.message || `${added}人追加`);
        if (added > 0) fetchMembers();
      } else {
        showMsg('error', data.error || '検出に失敗しました');
      }
    } catch { showMsg('error', '通信エラー'); }
    setDetecting(false);
  };

  // ========================================
  // チャネル追加フォーム開く時
  // ========================================
  useEffect(() => {
    if (showChannelForm && channelService !== 'email') {
      fetchAvailableChannels(channelService);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showChannelForm, channelService]);

  useEffect(() => {
    if (showMemberForm) {
      fetchAllContacts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMemberForm]);

  // フィルタ
  const filteredAvailableChannels = availableChannels.filter(ch =>
    ch.channel_name.toLowerCase().includes(channelSearch.toLowerCase())
  );

  const filteredContacts = allContacts.filter(c =>
    c.name.toLowerCase().includes(memberSearch.toLowerCase())
  );

  // ========================================
  // レンダリング
  // ========================================
  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-white">
        <Header />
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <div className="text-center">
            <div className="animate-spin text-2xl mb-2">&#8987;</div>
            <p className="text-sm">読み込み中...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="flex flex-col h-screen bg-white">
        <Header />
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <div className="text-center">
            <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-sm">組織が見つかりません</p>
            <button onClick={() => router.push('/organizations')} className="mt-3 text-xs text-blue-600 hover:underline">
              一覧に戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      <Header />
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* ページヘッダー */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => router.push('/organizations')}
              className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-slate-600" />
            </button>
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">{org.name}</h1>
              {org.domain && (
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  {org.domain}
                </p>
              )}
            </div>
            <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Link2 className="w-3.5 h-3.5" />
                {channels.length} チャネル
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {members.length} メンバー
              </span>
            </div>
          </div>

          {/* タブ */}
          <div className="flex gap-1">
            {[
              { key: 'info' as const, label: '基本情報', icon: Building2 },
              { key: 'channels' as const, label: 'チャネル', icon: Link2 },
              { key: 'members' as const, label: 'メンバー', icon: Users },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-t-lg transition-colors ${
                  activeTab === tab.key
                    ? 'bg-white text-blue-600 border border-slate-200 border-b-white -mb-px'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                {tab.key === 'channels' && channels.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-slate-100 rounded-full">{channels.length}</span>
                )}
                {tab.key === 'members' && members.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-slate-100 rounded-full">{members.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* メッセージバナー */}
        {message && (
          <div className={`mx-6 mt-3 px-3 py-2 rounded-lg text-xs font-medium ${
            message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* タブコンテンツ */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* ===== 基本情報タブ ===== */}
          {activeTab === 'info' && (
            <div className="max-w-lg space-y-4">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1">
                  <Building2 className="w-3.5 h-3.5" />
                  組織名
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1">
                  <Globe className="w-3.5 h-3.5" />
                  ドメイン
                </label>
                <input
                  type="text"
                  value={editDomain}
                  onChange={(e) => setEditDomain(e.target.value)}
                  placeholder="例: example.co.jp"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={saveOrg}
                disabled={!editName.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                保存
              </button>
            </div>
          )}

          {/* ===== チャネルタブ ===== */}
          {activeTab === 'channels' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  組織に紐づけるSlackチャネル・Chatworkルーム・メールドメインを管理します
                </p>
                <button
                  onClick={() => { setShowChannelForm(!showChannelForm); setChannelSearch(''); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  チャネル追加
                </button>
              </div>

              {/* チャネル追加フォーム */}
              {showChannelForm && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-700">チャネルを追加</h3>
                    <button onClick={() => setShowChannelForm(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* サービス選択 */}
                  <div className="flex gap-2 mb-3">
                    {(['slack', 'chatwork', 'email'] as const).map(svc => (
                      <button
                        key={svc}
                        onClick={() => { setChannelService(svc); setChannelSearch(''); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          channelService === svc
                            ? 'bg-blue-600 text-white'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <ServiceIcon service={svc} />
                        {svc === 'slack' ? 'Slack' : svc === 'chatwork' ? 'Chatwork' : 'Email'}
                      </button>
                    ))}
                  </div>

                  {/* Email ドメイン入力 */}
                  {channelService === 'email' ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={emailDomain}
                        onChange={(e) => setEmailDomain(e.target.value)}
                        placeholder="例: example.co.jp"
                        className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={addEmailDomain}
                        disabled={!emailDomain.trim()}
                        className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        追加
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* 検索 */}
                      <div className="relative mb-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={channelSearch}
                          onChange={(e) => setChannelSearch(e.target.value)}
                          placeholder="チャネルを検索..."
                          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {/* チャネル一覧 */}
                      <div className="max-h-60 overflow-y-auto space-y-1">
                        {loadingChannels ? (
                          <p className="text-xs text-slate-400 text-center py-4">読み込み中...</p>
                        ) : filteredAvailableChannels.length === 0 ? (
                          <p className="text-xs text-slate-400 text-center py-4">利用可能なチャネルがありません</p>
                        ) : (
                          filteredAvailableChannels.map(ch => (
                            <div
                              key={ch.channel_id}
                              className="flex items-center justify-between p-2 rounded-lg hover:bg-white transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <ServiceIcon service={channelService} />
                                <span className="text-sm text-slate-700">{ch.channel_name}</span>
                                {ch.member_count !== undefined && (
                                  <span className="text-[10px] text-slate-400">{ch.member_count}人</span>
                                )}
                              </div>
                              <button
                                onClick={() => addChannel(ch.channel_id, ch.channel_name, ch.channel_type)}
                                className="px-2 py-1 text-[10px] font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                              >
                                追加
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 紐づけ済みチャネル一覧 */}
              {channels.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-slate-400">
                  <div className="text-center">
                    <Link2 className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="text-xs">チャネルが紐づけられていません</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {channels.map(ch => (
                    <div
                      key={ch.id}
                      className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <ServiceBadge service={ch.service_name} />
                        <span className="text-sm font-medium text-slate-700">{ch.channel_name}</span>
                        {ch.channel_type && (
                          <span className="text-[10px] text-slate-400">{ch.channel_type}</span>
                        )}
                      </div>
                      <button
                        onClick={() => removeChannel(ch.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="解除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ===== メンバータブ ===== */}
          {activeTab === 'members' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  組織に所属するコンタクトを管理します
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={detectMembers}
                    disabled={detecting || channels.length === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors"
                    title={channels.length === 0 ? '先にチャネルを紐づけてください' : 'チャネルからメンバーを自動検出'}
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    {detecting ? '検出中...' : '自動検出'}
                  </button>
                  <button
                    onClick={() => { setShowMemberForm(!showMemberForm); setMemberSearch(''); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    メンバー追加
                  </button>
                </div>
              </div>

              {/* メンバー追加フォーム */}
              {showMemberForm && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-700">コンタクトから追加</h3>
                    <button onClick={() => setShowMemberForm(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="コンタクトを検索..."
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {filteredContacts.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">該当するコンタクトがありません</p>
                    ) : (
                      filteredContacts.slice(0, 50).map(c => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-white transition-colors"
                        >
                          <div>
                            <span className="text-sm text-slate-700">{c.name}</span>
                            {c.companyName && (
                              <span className="ml-2 text-[10px] text-slate-400">{c.companyName}</span>
                            )}
                          </div>
                          <button
                            onClick={() => addMember(c.id)}
                            className="px-2 py-1 text-[10px] font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                          >
                            追加
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* メンバー一覧 */}
              {members.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-slate-400">
                  <div className="text-center">
                    <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="text-xs">メンバーがいません</p>
                    <p className="text-[10px] mt-1">チャネルを追加して「自動検出」するか、手動で追加してください</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {members.map(m => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                          {m.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-700">{m.name}</span>
                            {m.auto_added_to_org && (
                              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-600 border border-amber-200 rounded-full">
                                自動追加
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            {m.main_channel && (
                              <span className="text-[10px] text-slate-400">{m.main_channel}</span>
                            )}
                            {m.message_count != null && m.message_count > 0 && (
                              <span className="text-[10px] text-slate-400">{m.message_count}件</span>
                            )}
                            {m.last_contact_at && (
                              <span className="text-[10px] text-slate-400">
                                最終: {new Date(m.last_contact_at).toLocaleDateString('ja-JP')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => removeMember(m.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="メンバーから外す"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
