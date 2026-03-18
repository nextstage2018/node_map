// v3.3: プロジェクトメンバー＆チャネル統合コンポーネント
// チャネル登録 → メンバー自動取り込み → 編集/削除
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users, UserPlus, Search, X, Trash2, ChevronDown, ChevronUp,
  Save, Mail, MessageSquare, Hash, Plus, Link2, AlertCircle, RefreshCw,
} from 'lucide-react';

// --- 型定義 ---

interface ContactChannel {
  id: string;
  channel: string;
  address: string;
  label: string | null;
  is_primary: boolean;
}

interface ProjectChannel {
  id: string;
  service_name: string;
  channel_identifier: string;
  channel_label: string | null;
  created_at: string;
}

interface AvailableChannel {
  channel_id: string;
  channel_name: string;
  channel_type: string;
  member_count?: number;
  is_subscribed: boolean;
}

interface ProjectMember {
  id: string | null;
  contact_id: string;
  role: string;

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

  // ★ v10.2: 紐づいている全チャネル（アイコン表示用）
  channels?: { channel: string; address: string }[];
}

interface Contact {
  id: string;
  name: string;
  companyName?: string;
}

interface EditForm {
  name: string;
  company_name: string;
  department: string;
  relationship_type: string;
  notes: string;
}

interface NewChannelForm {
  channel: string;
  address: string;
}

interface Props {
  projectId: string;
  projectName: string;
}

// --- ヘルパーコンポーネント ---

function ServiceIcon({ service }: { service: string }) {
  switch (service) {
    case 'slack': return <Hash className="w-4 h-4 text-purple-600" />;
    case 'chatwork': return <MessageSquare className="w-4 h-4 text-green-600" />;
    case 'email': return <Mail className="w-4 h-4 text-blue-600" />;
    default: return <Link2 className="w-4 h-4 text-slate-400" />;
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

// --- メインコンポーネント ---

export default function ProjectMembers({ projectId, projectName }: Props) {
  // チャネル関連
  const [projectChannels, setProjectChannels] = useState<ProjectChannel[]>([]);
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [selectedService, setSelectedService] = useState<'slack' | 'chatwork' | 'email'>('slack');
  const [availableChannels, setAvailableChannels] = useState<AvailableChannel[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [channelSearch, setChannelSearch] = useState('');
  const [emailDomain, setEmailDomain] = useState('');

  // メンバー関連
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualCompany, setManualCompany] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);

  // 展開・編集
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: '', company_name: '', department: '', relationship_type: 'internal', notes: '' });
  const [contactChannels, setContactChannels] = useState<ContactChannel[]>([]);
  const [loadingContactChannels, setLoadingContactChannels] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [newContactChannel, setNewContactChannel] = useState<NewChannelForm>({ channel: 'email', address: '' });
  const [showAddContactChannel, setShowAddContactChannel] = useState(false);

  // 検出
  const [detecting, setDetecting] = useState(false);

  // 共通
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // ========== チャネル ==========

  const fetchProjectChannels = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/channels`);
      const data = await res.json();
      if (data.success) setProjectChannels(data.data || []);
    } catch { /* */ }
  }, [projectId]);

  const fetchAvailableChannels = async (service: string) => {
    setLoadingAvailable(true);
    try {
      const res = await fetch(`/api/settings/channels/available?service=${service}`);
      const data = await res.json();
      if (data.success) {
        const linkedIds = new Set(
          projectChannels.filter(c => c.service_name === service).map(c => c.channel_identifier)
        );
        setAvailableChannels(
          (data.data || []).filter((ch: AvailableChannel) => !linkedIds.has(ch.channel_id))
        );
      }
    } catch { /* */ }
    setLoadingAvailable(false);
  };

  useEffect(() => {
    if (showAddChannel && selectedService !== 'email') {
      fetchAvailableChannels(selectedService);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddChannel, selectedService]);

  const addProjectChannel = async (channelId: string, channelName: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceName: selectedService,
          channelIdentifier: channelId,
          channelLabel: channelName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg('success', `${channelName} を追加しました`);
        fetchProjectChannels();
        setAvailableChannels(prev => prev.filter(c => c.channel_id !== channelId));
      } else {
        showMsg('error', data.error || '追加に失敗しました');
      }
    } catch {
      showMsg('error', '通信エラー');
    }
  };

  const addEmailDomainChannel = async () => {
    const domain = emailDomain.trim().replace(/^@/, '');
    if (!domain) return;
    await addProjectChannel(`@${domain}`, `@${domain}`);
    setEmailDomain('');
  };

  const removeProjectChannel = async (channelDbId: string) => {
    if (!confirm('このチャネルの紐づけを解除しますか？')) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/channels?channelId=${channelDbId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showMsg('success', 'チャネルを解除しました');
        fetchProjectChannels();
      }
    } catch {
      showMsg('error', '通信エラー');
    }
  };

  // ========== メンバー ==========

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/members`);
      const data = await res.json();
      if (data.success) {
        setMembers(data.data || []);
      }
    } catch { /* */ }
  }, [projectId]);

  const fetchContacts = async () => {
    try {
      const res = await fetch('/api/contacts');
      const data = await res.json();
      if (data.success) {
        const memberContactIds = new Set(members.map(m => m.contact_id));
        setAllContacts(
          (data.data || [])
            .filter((c: Record<string, unknown>) => !memberContactIds.has(c.id as string))
            .map((c: Record<string, unknown>) => ({
              id: c.id as string,
              name: c.name as string,
              companyName: c.companyName as string | undefined,
            }))
        );
      }
    } catch { /* */ }
  };

  useEffect(() => {
    if (showAddMember) fetchContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddMember]);

  const addMember = async (contactId: string, contactName?: string, companyName?: string) => {
    try {
      const contact = allContacts.find(c => c.id === contactId);
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: contactId,
          name: contactName || contact?.name,
          companyName: companyName || contact?.companyName,
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

  const addManualMember = async () => {
    if (!manualName.trim()) return;
    await addMember(`auto_manual_${Date.now()}`, manualName.trim(), manualCompany.trim());
    setManualName('');
    setManualCompany('');
    setShowManualForm(false);
  };

  const removeMember = async (memberId: string | null, contactId: string) => {
    if (!confirm('このメンバーをプロジェクトから外しますか？')) return;
    try {
      const param = memberId ? `memberId=${memberId}` : `contactId=${contactId}`;
      const res = await fetch(`/api/projects/${projectId}/members?${param}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showMsg('success', 'メンバーを外しました');
        if (expandedContactId === contactId) setExpandedContactId(null);
        fetchMembers();
      }
    } catch {
      showMsg('error', '通信エラー');
    }
  };

  // ========== 自動検出 ==========

  const detectMembers = async () => {
    setDetecting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/members/detect`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showMsg('success', data.message);
        if (data.data.added > 0) fetchMembers();
      } else {
        showMsg('error', data.error || '検出に失敗しました');
      }
    } catch {
      showMsg('error', '通信エラー');
    }
    setDetecting(false);
  };

  // ========== 展開・編集 ==========

  const toggleExpand = async (member: ProjectMember) => {
    const cId = member.contact_id;
    if (expandedContactId === cId) { setExpandedContactId(null); return; }
    setExpandedContactId(cId);
    setEditForm({
      name: member.contact.name || '',
      company_name: member.contact.company_name || '',
      department: '',
      relationship_type: member.contact.relationship_type || 'internal',
      notes: '',
    });
    setShowAddContactChannel(false);
    setNewContactChannel({ channel: 'email', address: '' });
    fetchContactDetail(cId);
    fetchContactChannels(cId);
  };

  const fetchContactDetail = async (contactId: string) => {
    try {
      const res = await fetch('/api/contacts');
      const data = await res.json();
      if (data.success) {
        const c = (data.data || []).find((item: Record<string, unknown>) => item.id === contactId);
        if (c) {
          setEditForm(prev => ({
            ...prev,
            department: (c.department as string) || '',
            notes: (c.notes as string) || '',
            name: (c.name as string) || prev.name,
            company_name: (c.companyName as string) || (c.company_name as string) || prev.company_name,
            relationship_type: (c.relationshipType as string) || (c.relationship_type as string) || prev.relationship_type,
          }));
        }
      }
    } catch { /* */ }
  };

  const fetchContactChannels = async (contactId: string) => {
    setLoadingContactChannels(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/channels`);
      const data = await res.json();
      if (data.success) setContactChannels(data.data || []);
    } catch { /* */ }
    setLoadingContactChannels(false);
  };

  const saveContact = async (contactId: string) => {
    setSavingContact(true);
    try {
      const res = await fetch('/api/contacts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: contactId,
          name: editForm.name.trim() || undefined,
          relationshipType: editForm.relationship_type || undefined,
          companyName: editForm.company_name.trim() || undefined,
          department: editForm.department.trim() || undefined,
          notes: editForm.notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg('success', 'コンタクト情報を更新しました');
        fetchMembers();
      } else {
        showMsg('error', data.error || '更新に失敗しました');
      }
    } catch {
      showMsg('error', '通信エラー');
    }
    setSavingContact(false);
  };

  const addContactChannel = async (contactId: string) => {
    if (!newContactChannel.address.trim()) return;
    try {
      const res = await fetch(`/api/contacts/${contactId}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: newContactChannel.channel, address: newContactChannel.address.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg('success', 'チャンネルを追加しました');
        setNewContactChannel({ channel: 'email', address: '' });
        setShowAddContactChannel(false);
        fetchContactChannels(contactId);
      } else {
        showMsg('error', data.error || '追加に失敗しました');
      }
    } catch {
      showMsg('error', '通信エラー');
    }
  };

  const removeContactChannel = async (contactId: string, channelId: string) => {
    try {
      const res = await fetch(`/api/contacts/${contactId}/channels?channelId=${channelId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) fetchContactChannels(contactId);
      else showMsg('error', data.error || '削除に失敗しました');
    } catch {
      showMsg('error', '通信エラー');
    }
  };

  // ========== 初期ロード ==========

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await Promise.all([fetchProjectChannels(), fetchMembers()]);
      setIsLoading(false);
    };
    load();
  }, [fetchProjectChannels, fetchMembers]);

  // ========== フィルタ ==========

  const filteredAvailable = availableChannels.filter(ch =>
    ch.channel_name.toLowerCase().includes(channelSearch.toLowerCase())
  );

  const filteredContacts = allContacts.filter(c =>
    c.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
    (c.companyName || '').toLowerCase().includes(memberSearch.toLowerCase())
  );

  const channelCountByService = projectChannels.reduce((acc, ch) => {
    acc[ch.service_name] = (acc[ch.service_name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const hasMultipleWarning = Object.values(channelCountByService).some(count => count > 1);

  // ========== ヘルパー ==========

  const roleBadge = (role: string) => {
    const config: Record<string, { label: string; cls: string }> = {
      owner: { label: 'オーナー', cls: 'bg-blue-50 text-blue-700' },
      member: { label: 'メンバー', cls: 'bg-slate-100 text-slate-600' },
      viewer: { label: '閲覧者', cls: 'bg-slate-50 text-slate-500' },
    };
    const c = config[role] || config.member;
    return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${c.cls}`}>{c.label}</span>;
  };

  const chIcon = (ch: string) => {
    switch (ch) {
      case 'email': return <Mail className="w-3.5 h-3.5 text-blue-500" />;
      case 'slack': return <Hash className="w-3.5 h-3.5 text-purple-500" />;
      case 'chatwork': return <MessageSquare className="w-3.5 h-3.5 text-green-500" />;
      default: return <Mail className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const chLabel = (ch: string) => {
    switch (ch) {
      case 'email': return 'メール';
      case 'slack': return 'Slack';
      case 'chatwork': return 'Chatwork';
      default: return ch;
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center py-16">
        <div className="animate-spin text-2xl">&#8987;</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {message && (
        <div className={`px-3 py-2 rounded-lg text-xs font-medium ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>{message.text}</div>
      )}

      {/* ===== セクション1: チャネル ===== */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-slate-500" />チャネル
          </h2>
          <button
            onClick={() => { setShowAddChannel(!showAddChannel); setChannelSearch(''); }}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <Plus className="w-3 h-3" />チャネル追加
          </button>
        </div>

        {/* 推奨ガイド（チャネル未登録時のみ） */}
        {projectChannels.length === 0 && (
          <div className="px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs font-medium text-blue-800 mb-1">推奨構成（1メディア = 1チャネル）</p>
            <div className="flex flex-wrap gap-2 text-[11px] text-blue-700">
              <span className="flex items-center gap-1"><Hash className="w-3 h-3 text-purple-500" />Slack: 1チャネル</span>
              <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3 text-green-500" />Chatwork: 1ルーム</span>
              <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-blue-500" />メール: 任意</span>
            </div>
          </div>
        )}

        {hasMultipleWarning && (
          <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">同一メディアに複数チャネルが紐づいています。</p>
          </div>
        )}

        {/* チャネル追加フォーム */}
        {showAddChannel && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">チャネルを追加</h3>
              <button onClick={() => setShowAddChannel(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex gap-2 mb-3">
              {(['slack', 'chatwork', 'email'] as const).map(svc => (
                <button
                  key={svc}
                  onClick={() => { setSelectedService(svc); setChannelSearch(''); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    selectedService === svc
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <ServiceIcon service={svc} />
                  {svc === 'slack' ? 'Slack' : svc === 'chatwork' ? 'Chatwork' : 'Email'}
                </button>
              ))}
            </div>
            {selectedService === 'email' ? (
              <div className="flex gap-2">
                <input type="text" value={emailDomain} onChange={(e) => setEmailDomain(e.target.value)}
                  placeholder="例: example.co.jp"
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={addEmailDomainChannel} disabled={!emailDomain.trim()}
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">追加</button>
              </div>
            ) : (
              <>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="text" value={channelSearch} onChange={(e) => setChannelSearch(e.target.value)}
                    placeholder="チャネルを検索..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {loadingAvailable ? (
                    <p className="text-xs text-slate-400 text-center py-4">読み込み中...</p>
                  ) : filteredAvailable.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">利用可能なチャネルがありません</p>
                  ) : filteredAvailable.map(ch => (
                    <div key={ch.channel_id} className="flex items-center justify-between p-2 rounded-lg hover:bg-white transition-colors">
                      <div className="flex items-center gap-2">
                        <ServiceIcon service={selectedService} />
                        <span className="text-sm text-slate-700">{ch.channel_name}</span>
                        {ch.member_count !== undefined && <span className="text-[10px] text-slate-400">{ch.member_count}人</span>}
                      </div>
                      <button onClick={() => addProjectChannel(ch.channel_id, ch.channel_name)}
                        className="px-2 py-1 text-[10px] font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100">追加</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* 登録済みチャネル一覧 */}
        {projectChannels.length > 0 && (
          <div className="space-y-1.5">
            {projectChannels.map(ch => (
              <div key={ch.id} className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <ServiceBadge service={ch.service_name} />
                  <span className="text-sm font-medium text-slate-700">{ch.channel_label || ch.channel_identifier}</span>
                </div>
                <button onClick={() => removeProjectChannel(ch.id)}
                  className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="解除">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* メンバー自動検出ボタン（チャネルが1つ以上あるとき） */}
        {projectChannels.length > 0 && (
          <button
            onClick={detectMembers}
            disabled={detecting}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${detecting ? 'animate-spin' : ''}`} />
            {detecting ? 'メンバーを検出中...' : 'チャネルからメンバーを自動取り込み'}
          </button>
        )}
      </div>

      {/* 区切り線 */}
      <hr className="border-slate-200" />

      {/* ===== セクション2: メンバー ===== */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" />メンバー
            <span className="text-[10px] text-slate-400 font-normal">{members.length}人</span>
          </h2>
          <button
            onClick={() => { setShowAddMember(!showAddMember); setMemberSearch(''); }}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <UserPlus className="w-3 h-3" />手動追加
          </button>
        </div>


        {/* 手動メンバー追加フォーム */}
        {showAddMember && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">コンタクトから追加</h3>
              <button onClick={() => setShowAddMember(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="コンタクトを検索..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredContacts.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">該当するコンタクトがありません</p>
              ) : filteredContacts.slice(0, 50).map(c => (
                <div key={c.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-white transition-colors">
                  <div>
                    <span className="text-sm text-slate-700">{c.name}</span>
                    {c.companyName && <span className="ml-2 text-[10px] text-slate-400">{c.companyName}</span>}
                  </div>
                  <button onClick={() => addMember(c.id)}
                    className="px-2 py-1 text-[10px] font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100">追加</button>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-200">
              {!showManualForm ? (
                <button onClick={() => setShowManualForm(true)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                  + コンタクト一覧にない人を手動で追加
                </button>
              ) : (
                <div className="space-y-2">
                  <input type="text" value={manualName} onChange={(e) => setManualName(e.target.value)}
                    placeholder="名前（必須）"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input type="text" value={manualCompany} onChange={(e) => setManualCompany(e.target.value)}
                    placeholder="会社名（任意）"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <div className="flex gap-2">
                    <button onClick={addManualMember} disabled={!manualName.trim()}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">追加</button>
                    <button onClick={() => { setShowManualForm(false); setManualName(''); setManualCompany(''); }}
                      className="px-3 py-1.5 text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">キャンセル</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* メンバー一覧（展開式カード） */}
        {members.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-slate-400">
            <div className="text-center">
              <Users className="w-6 h-6 mx-auto mb-1 text-slate-300" />
              <p className="text-xs">メンバーがいません</p>
              {projectChannels.length > 0 && (
                <p className="text-[10px] mt-1">上の「チャネルからメンバーを自動取り込み」を試してみてください</p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {members.map((m, idx) => {
              const isExpanded = expandedContactId === m.contact_id;
              return (
                <div key={m.id || `fb-${idx}`} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  {/* カードヘッダー */}
                  <div className="p-3 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => toggleExpand(m)}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-[11px] font-bold text-slate-500">
                          {m.contact.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-700">{m.contact.name}</span>
                            {roleBadge(m.role)}
                            {m.contact.company_name && (
                              <span className="text-[10px] text-slate-400">{m.contact.company_name}</span>
                            )}
                            {/* ★ v10.2: 紐づいているチャネルのアイコン表示 */}
                            {m.channels && m.channels.length > 0 && (
                              <div className="flex items-center gap-0.5 ml-1">
                                {/* チャネル種別ごとに1アイコンだけ表示（重複排除） */}
                                {[...new Set(m.channels.map(ch => ch.channel))].map(chType => (
                                  <span key={chType} className="flex items-center" title={
                                    chType === 'slack' ? 'Slack' : chType === 'chatwork' ? 'Chatwork' : chType === 'email' ? 'Email' : chType
                                  }>
                                    {chType === 'slack' && <Hash className="w-3 h-3 text-purple-400" />}
                                    {chType === 'chatwork' && <MessageSquare className="w-3 h-3 text-green-400" />}
                                    {chType === 'email' && <Mail className="w-3 h-3 text-blue-400" />}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={(e) => { e.stopPropagation(); removeMember(m.id, m.contact_id); }}
                          className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="外す">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </div>
                    </div>
                  </div>

                  {/* 展開エリア */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 p-4 bg-slate-50 space-y-4">
                      {/* 基本情報 */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-slate-600">基本情報</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] text-slate-500 mb-1 block">名前</label>
                            <input type="text" value={editForm.name}
                              onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))}
                              className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-500 mb-1 block">会社名</label>
                            <input type="text" value={editForm.company_name}
                              onChange={(e) => setEditForm(p => ({ ...p, company_name: e.target.value }))}
                              className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-500 mb-1 block">部署</label>
                            <input type="text" value={editForm.department}
                              onChange={(e) => setEditForm(p => ({ ...p, department: e.target.value }))}
                              placeholder="例: 営業部"
                              className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-500 mb-1 block">関係性</label>
                            <select value={editForm.relationship_type}
                              onChange={(e) => setEditForm(p => ({ ...p, relationship_type: e.target.value }))}
                              className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                              <option value="internal">社内 (internal)</option>
                              <option value="client">クライアント (client)</option>
                              <option value="partner">パートナー (partner)</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 mb-1 block">メモ</label>
                          <textarea value={editForm.notes}
                            onChange={(e) => setEditForm(p => ({ ...p, notes: e.target.value }))}
                            placeholder="自由記述メモ" rows={2}
                            className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                        </div>
                        <button onClick={() => saveContact(m.contact_id)} disabled={savingContact}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                          <Save className="w-3.5 h-3.5" />{savingContact ? '保存中...' : '基本情報を保存'}
                        </button>
                      </div>

                      {/* 連絡先チャネル */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-semibold text-slate-600">連絡先チャネル</h4>
                          <button onClick={() => setShowAddContactChannel(!showAddContactChannel)}
                            className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:text-blue-700">
                            <Plus className="w-3 h-3" />追加
                          </button>
                        </div>
                        {loadingContactChannels ? (
                          <p className="text-[10px] text-slate-400">読み込み中...</p>
                        ) : contactChannels.length === 0 ? (
                          <p className="text-[10px] text-slate-400">チャネル未登録</p>
                        ) : (
                          <div className="space-y-1.5">
                            {contactChannels.map(ch => (
                              <div key={ch.id} className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-lg">
                                <div className="flex items-center gap-2">
                                  {chIcon(ch.channel)}
                                  <span className="text-[10px] font-medium text-slate-500">{chLabel(ch.channel)}</span>
                                  <span className="text-sm text-slate-700">{ch.address}</span>
                                </div>
                                <button onClick={() => removeContactChannel(m.contact_id, ch.id)}
                                  className="p-1 text-slate-300 hover:text-red-500 transition-colors" title="削除">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        {showAddContactChannel && (
                          <div className="flex items-end gap-2">
                            <div>
                              <label className="text-[10px] text-slate-500 mb-1 block">種別</label>
                              <select value={newContactChannel.channel}
                                onChange={(e) => setNewContactChannel(p => ({ ...p, channel: e.target.value }))}
                                className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="email">メール</option>
                                <option value="slack">Slack</option>
                                <option value="chatwork">Chatwork</option>
                              </select>
                            </div>
                            <div className="flex-1">
                              <label className="text-[10px] text-slate-500 mb-1 block">
                                {newContactChannel.channel === 'email' ? 'メールアドレス' : newContactChannel.channel === 'slack' ? 'Slack ID (UXXXXX)' : 'Chatwork ID'}
                              </label>
                              <input type="text" value={newContactChannel.address}
                                onChange={(e) => setNewContactChannel(p => ({ ...p, address: e.target.value }))}
                                placeholder={newContactChannel.channel === 'email' ? 'example@company.com' : newContactChannel.channel === 'slack' ? 'UXXXXX' : '12345'}
                                className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <button onClick={() => addContactChannel(m.contact_id)} disabled={!newContactChannel.address.trim()}
                              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">追加</button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
