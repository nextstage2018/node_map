// v3.3: プロジェクトメンバー管理コンポーネント
// project_members テーブル経由。空なら組織メンバーにフォールバック
// メンバーカード展開でコンタクト情報編集＋チャネル管理
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users, UserPlus, Search, X, Trash2, ChevronDown, ChevronUp,
  Save, Mail, MessageSquare, Hash, Plus,
} from 'lucide-react';

interface ContactChannel {
  id: string;
  channel: string;   // 'email' | 'slack' | 'chatwork'
  address: string;
  label: string | null;
  is_primary: boolean;
}

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

interface ManualInput {
  name: string;
  companyName: string;
}

// 編集フォームの型
interface EditForm {
  name: string;
  company_name: string;
  department: string;
  relationship_type: string;
  notes: string;
}

// チャネル追加フォーム
interface NewChannel {
  channel: string;
  address: string;
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
  const [manualInput, setManualInput] = useState<ManualInput>({ name: '', companyName: '' });
  const [showManualForm, setShowManualForm] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 展開・編集ステート
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: '', company_name: '', department: '', relationship_type: 'internal', notes: '' });
  const [channels, setChannels] = useState<ContactChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [newChannel, setNewChannel] = useState<NewChannel>({ channel: 'email', address: '' });
  const [showAddChannel, setShowAddChannel] = useState(false);

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
    if (!manualInput.name.trim()) return;
    const autoId = `auto_manual_${Date.now()}`;
    await addMember(autoId, manualInput.name.trim(), manualInput.companyName.trim());
    setManualInput({ name: '', companyName: '' });
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

  // --- 展開・編集 ---
  const toggleExpand = async (member: ProjectMember) => {
    const cId = member.contact_id;
    if (expandedContactId === cId) {
      setExpandedContactId(null);
      return;
    }
    // 展開: フォーム初期化 + チャネル読み込み
    setExpandedContactId(cId);
    setEditForm({
      name: member.contact.name || '',
      company_name: member.contact.company_name || '',
      department: '', // contact_personsにdepartmentはあるがメンバーAPIからは返ってないのでfetch必要
      relationship_type: member.contact.relationship_type || 'internal',
      notes: '',
    });
    setShowAddChannel(false);
    setNewChannel({ channel: 'email', address: '' });
    // コンタクト詳細をフェッチしてdepartment/notesを補完
    fetchContactDetail(cId);
    fetchChannels(cId);
  };

  const fetchContactDetail = async (contactId: string) => {
    try {
      // contacts API GETは全件。個別取得の代わりにフィルタ
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

  const fetchChannels = async (contactId: string) => {
    setLoadingChannels(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/channels`);
      const data = await res.json();
      if (data.success) {
        setChannels(data.data || []);
      }
    } catch { /* */ }
    setLoadingChannels(false);
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
        fetchMembers(); // メンバー一覧をリフレッシュ
      } else {
        showMsg('error', data.error || '更新に失敗しました');
      }
    } catch {
      showMsg('error', '通信エラー');
    }
    setSavingContact(false);
  };

  const addChannel = async (contactId: string) => {
    if (!newChannel.address.trim()) return;
    try {
      const res = await fetch(`/api/contacts/${contactId}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: newChannel.channel,
          address: newChannel.address.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg('success', 'チャンネルを追加しました');
        setNewChannel({ channel: 'email', address: '' });
        setShowAddChannel(false);
        fetchChannels(contactId);
      } else {
        showMsg('error', data.error || '追加に失敗しました');
      }
    } catch {
      showMsg('error', '通信エラー');
    }
  };

  const removeChannel = async (contactId: string, channelId: string) => {
    try {
      const res = await fetch(`/api/contacts/${contactId}/channels?channelId=${channelId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchChannels(contactId);
      } else {
        showMsg('error', data.error || '削除に失敗しました');
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

  const channelIcon = (ch: string) => {
    switch (ch) {
      case 'email': return <Mail className="w-3.5 h-3.5 text-blue-500" />;
      case 'slack': return <Hash className="w-3.5 h-3.5 text-purple-500" />;
      case 'chatwork': return <MessageSquare className="w-3.5 h-3.5 text-green-500" />;
      default: return <Mail className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const channelLabel = (ch: string) => {
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

          {/* 手動入力セクション */}
          <div className="mt-3 pt-3 border-t border-slate-200">
            {!showManualForm ? (
              <button
                onClick={() => setShowManualForm(true)}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                + コンタクト一覧にない人を手動で追加
              </button>
            ) : (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-600">手動でメンバーを追加</h4>
                <input
                  type="text"
                  value={manualInput.name}
                  onChange={(e) => setManualInput(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="名前（必須）"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={manualInput.companyName}
                  onChange={(e) => setManualInput(prev => ({ ...prev, companyName: e.target.value }))}
                  placeholder="会社名（任意）"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={addManualMember}
                    disabled={!manualInput.name.trim()}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >追加</button>
                  <button
                    onClick={() => { setShowManualForm(false); setManualInput({ name: '', companyName: '' }); }}
                    className="px-3 py-1.5 text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >キャンセル</button>
                </div>
              </div>
            )}
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
          {members.map((m, idx) => {
            const isExpanded = expandedContactId === m.contact_id;
            return (
              <div key={m.id || `fb-${idx}`} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                {/* メンバーカードヘッダー */}
                <div
                  className="p-3 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => toggleExpand(m)}
                >
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
                    <div className="flex items-center gap-1">
                      {!isFallback && (
                        <button
                          onClick={(e) => { e.stopPropagation(); removeMember(m.id, m.contact_id); }}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="外す"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>
                </div>

                {/* 展開エリア: コンタクト情報編集 + チャネル管理 */}
                {isExpanded && (
                  <div className="border-t border-slate-100 p-4 bg-slate-50 space-y-4">
                    {/* 基本情報編集 */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold text-slate-600">基本情報</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] text-slate-500 mb-1 block">名前</label>
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 mb-1 block">会社名</label>
                          <input
                            type="text"
                            value={editForm.company_name}
                            onChange={(e) => setEditForm(prev => ({ ...prev, company_name: e.target.value }))}
                            className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 mb-1 block">部署</label>
                          <input
                            type="text"
                            value={editForm.department}
                            onChange={(e) => setEditForm(prev => ({ ...prev, department: e.target.value }))}
                            placeholder="例: 営業部"
                            className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 mb-1 block">関係性</label>
                          <select
                            value={editForm.relationship_type}
                            onChange={(e) => setEditForm(prev => ({ ...prev, relationship_type: e.target.value }))}
                            className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="internal">社内 (internal)</option>
                            <option value="client">クライアント (client)</option>
                            <option value="partner">パートナー (partner)</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 mb-1 block">メモ</label>
                        <textarea
                          value={editForm.notes}
                          onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                          placeholder="自由記述メモ"
                          rows={2}
                          className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                      </div>
                      <button
                        onClick={() => saveContact(m.contact_id)}
                        disabled={savingContact}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {savingContact ? '保存中...' : '基本情報を保存'}
                      </button>
                    </div>

                    {/* チャネル管理 */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-slate-600">連絡先チャネル</h4>
                        <button
                          onClick={() => setShowAddChannel(!showAddChannel)}
                          className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:text-blue-700"
                        >
                          <Plus className="w-3 h-3" />追加
                        </button>
                      </div>

                      {loadingChannels ? (
                        <p className="text-[10px] text-slate-400">読み込み中...</p>
                      ) : channels.length === 0 ? (
                        <p className="text-[10px] text-slate-400">チャネル未登録</p>
                      ) : (
                        <div className="space-y-1.5">
                          {channels.map(ch => (
                            <div key={ch.id} className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-lg">
                              <div className="flex items-center gap-2">
                                {channelIcon(ch.channel)}
                                <span className="text-[10px] font-medium text-slate-500">{channelLabel(ch.channel)}</span>
                                <span className="text-sm text-slate-700">{ch.address}</span>
                              </div>
                              <button
                                onClick={() => removeChannel(m.contact_id, ch.id)}
                                className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                                title="削除"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {showAddChannel && (
                        <div className="flex items-end gap-2">
                          <div>
                            <label className="text-[10px] text-slate-500 mb-1 block">種別</label>
                            <select
                              value={newChannel.channel}
                              onChange={(e) => setNewChannel(prev => ({ ...prev, channel: e.target.value }))}
                              className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="email">メール</option>
                              <option value="slack">Slack</option>
                              <option value="chatwork">Chatwork</option>
                            </select>
                          </div>
                          <div className="flex-1">
                            <label className="text-[10px] text-slate-500 mb-1 block">
                              {newChannel.channel === 'email' ? 'メールアドレス' : newChannel.channel === 'slack' ? 'Slack ユーザーID (UXXXXX)' : 'Chatwork アカウントID'}
                            </label>
                            <input
                              type="text"
                              value={newChannel.address}
                              onChange={(e) => setNewChannel(prev => ({ ...prev, address: e.target.value }))}
                              placeholder={newChannel.channel === 'email' ? 'example@company.com' : newChannel.channel === 'slack' ? 'UXXXXX' : '12345'}
                              className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <button
                            onClick={() => addChannel(m.contact_id)}
                            disabled={!newChannel.address.trim()}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                          >追加</button>
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
  );
}
