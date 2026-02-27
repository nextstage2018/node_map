// Phase 30d + 33: ビジネスログ — タイムラインUI（イベント強化版）
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FolderOpen, Plus, Clock, FileText, Phone, Mail, MessageSquare,
  Handshake, X, ChevronRight, ClipboardList, Pencil, Trash2, Users,
  AlertTriangle, Bookmark, Link2, Hash,
} from 'lucide-react';
import AppLayout from '@/components/shared/AppLayout';
import ContextBar from '@/components/shared/ContextBar';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/EmptyState';

// ========================================
// 型定義
// ========================================
interface Organization {
  id: string;
  name: string;
  relationship_type?: string;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  organization_id?: string | null;
  organization_name?: string | null;
  created_at: string;
  updated_at: string;
}

interface ProjectChannel {
  id: string;
  project_id: string;
  organization_channel_id?: string;
  service_name: string;
  channel_identifier: string;
  channel_label?: string;
  created_at: string;
}

interface ChannelMessage {
  id: string;
  subject?: string;
  body?: string;
  from_name?: string;
  from_address?: string;
  timestamp: string;
  channel?: string;
  direction?: string;
  metadata?: Record<string, any>;
}

interface BusinessEvent {
  id: string;
  title: string;
  content: string | null;
  event_type: string;
  project_id: string | null;
  group_id: string | null;
  contact_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ContactOption {
  id: string;
  name: string;
}

// ========================================
// 定数
// ========================================
const EVENT_TYPE_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  note: { label: 'メモ', icon: FileText, color: 'bg-slate-100 text-slate-600' },
  meeting: { label: '打ち合わせ', icon: Handshake, color: 'bg-blue-100 text-blue-700' },
  call: { label: '電話', icon: Phone, color: 'bg-green-100 text-green-700' },
  email: { label: 'メール', icon: Mail, color: 'bg-orange-100 text-orange-700' },
  chat: { label: 'チャット', icon: MessageSquare, color: 'bg-purple-100 text-purple-700' },
  decision: { label: '意思決定', icon: Bookmark, color: 'bg-red-100 text-red-700' },
};

const PROJECT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: '進行中', color: 'bg-green-100 text-green-700' },
  completed: { label: '完了', color: 'bg-slate-100 text-slate-500' },
  on_hold: { label: '保留', color: 'bg-orange-100 text-orange-700' },
};

// ========================================
// ユーティリティ
// ========================================
function formatDateTime(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const time = d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  if (days === 0) return `今日 ${time}`;
  if (days === 1) return `昨日 ${time}`;
  if (days < 7) return `${days}日前 ${time}`;
  return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }) + ` ${time}`;
}

function groupEventsByDate(events: BusinessEvent[]): Map<string, BusinessEvent[]> {
  const groups = new Map<string, BusinessEvent[]>();
  for (const event of events) {
    const date = new Date(event.created_at).toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
    });
    const existing = groups.get(date) || [];
    existing.push(event);
    groups.set(date, existing);
  }
  return groups;
}

// ========================================
// メインコンポーネント
// ========================================
export default function BusinessLogPage() {
  // プロジェクト
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);

  // イベント
  const [events, setEvents] = useState<BusinessEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<BusinessEvent | null>(null);

  // Phase 33: コンタクト（参加者選択用）
  const [contacts, setContacts] = useState<ContactOption[]>([]);

  // 組織
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  // Phase 40c: プロジェクトチャネル & メッセージ
  const [projectChannels, setProjectChannels] = useState<ProjectChannel[]>([]);
  const [channelMessages, setChannelMessages] = useState<ChannelMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [showChannelSettings, setShowChannelSettings] = useState(false);
  const [orgChannels, setOrgChannels] = useState<any[]>([]);
  const [timelineTab, setTimelineTab] = useState<'events' | 'messages'>('events');

  // 新規作成フォーム
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [newProjectOrgId, setNewProjectOrgId] = useState('');
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventContent, setNewEventContent] = useState('');
  const [newEventType, setNewEventType] = useState('note');
  // Phase 33: 新規フォーム追加フィールド
  const [newEventMinutes, setNewEventMinutes] = useState('');
  const [newEventDecision, setNewEventDecision] = useState('');
  const [newEventParticipants, setNewEventParticipants] = useState<string[]>([]);

  // Phase 33: 編集モード
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editEventType, setEditEventType] = useState('note');

  // Phase 33: 削除確認
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // メッセージ
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  // ========================================
  // データ取得
  // ========================================
  const fetchProjects = useCallback(async () => {
    setIsLoadingProjects(true);
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      if (data.success) setProjects(data.data || []);
    } catch { /* エラーは無視 */ }
    finally { setIsLoadingProjects(false); }
  }, []);

  const fetchEvents = useCallback(async () => {
    setIsLoadingEvents(true);
    try {
      const params = new URLSearchParams();
      if (selectedProjectId) params.set('project_id', selectedProjectId);
      const res = await fetch(`/api/business-events?${params}`);
      const data = await res.json();
      if (data.success) setEvents(data.data || []);
    } catch { /* エラーは無視 */ }
    finally { setIsLoadingEvents(false); }
  }, [selectedProjectId]);

  // Phase 40c: 組織一覧取得
  const fetchOrganizations = useCallback(async () => {
    try {
      const res = await fetch('/api/organizations');
      const data = await res.json();
      if (data.success && data.data) {
        setOrganizations(data.data.map((o: any) => ({ id: o.id, name: o.name, relationship_type: o.relationship_type })));
      }
    } catch { /* エラーは無視 */ }
  }, []);

  // Phase 40c: プロジェクトのチャネル取得
  const fetchProjectChannels = useCallback(async (projId: string) => {
    try {
      const res = await fetch(`/api/projects/${projId}/channels`);
      const data = await res.json();
      if (data.success) setProjectChannels(data.data || []);
      else setProjectChannels([]);
    } catch { setProjectChannels([]); }
  }, []);

  // Phase 40c: プロジェクトのチャネルメッセージ取得
  const fetchChannelMessages = useCallback(async (projId: string) => {
    setIsLoadingMessages(true);
    try {
      const res = await fetch(`/api/projects/${projId}/messages?limit=100`);
      const data = await res.json();
      if (data.success) setChannelMessages(data.data || []);
      else setChannelMessages([]);
    } catch { setChannelMessages([]); }
    finally { setIsLoadingMessages(false); }
  }, []);

  // Phase 40c: 組織のチャネル取得（チャネル選択用）
  const fetchOrgChannels = useCallback(async (orgId: string) => {
    try {
      const res = await fetch(`/api/organizations/${orgId}/channels`);
      const data = await res.json();
      if (data.success) setOrgChannels(data.data || []);
      else setOrgChannels([]);
    } catch { setOrgChannels([]); }
  }, []);

  // Phase 40c: プロジェクトにチャネルを追加
  const addProjectChannel = async (orgChannel: any) => {
    if (!selectedProjectId) return;
    try {
      const res = await fetch(`/api/projects/${selectedProjectId}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationChannelId: orgChannel.id,
          serviceName: orgChannel.service_name,
          channelIdentifier: orgChannel.channel_id,
          channelLabel: orgChannel.channel_name,
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchProjectChannels(selectedProjectId);
        fetchChannelMessages(selectedProjectId);
        showMsg('success', 'チャネルを紐づけました');
      } else {
        showMsg('error', data.error || '追加に失敗しました');
      }
    } catch { showMsg('error', '通信エラー'); }
  };

  // Phase 40c: プロジェクトからチャネルを削除
  const removeProjectChannel = async (channelDbId: string) => {
    if (!selectedProjectId) return;
    try {
      const res = await fetch(`/api/projects/${selectedProjectId}/channels?channelId=${channelDbId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        fetchProjectChannels(selectedProjectId);
        fetchChannelMessages(selectedProjectId);
        showMsg('success', 'チャネルの紐づけを解除しました');
      } else {
        showMsg('error', data.error || '削除に失敗しました');
      }
    } catch { showMsg('error', '通信エラー'); }
  };

  // Phase 33: コンタクト取得（参加者選択用）
  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts');
      const data = await res.json();
      if (data.success && data.data) {
        setContacts(data.data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      }
    } catch { /* エラーは無視 */ }
  }, []);

  useEffect(() => { fetchProjects(); fetchContacts(); fetchOrganizations(); }, [fetchProjects, fetchContacts, fetchOrganizations]);
  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Phase 40c: プロジェクト選択時にチャネル＆メッセージを取得
  useEffect(() => {
    if (selectedProjectId) {
      fetchProjectChannels(selectedProjectId);
      fetchChannelMessages(selectedProjectId);
      // 組織のチャネルも取得（設定用）
      const proj = projects.find(p => p.id === selectedProjectId);
      if (proj?.organization_id) {
        fetchOrgChannels(proj.organization_id);
      } else {
        setOrgChannels([]);
      }
    } else {
      setProjectChannels([]);
      setChannelMessages([]);
      setOrgChannels([]);
      setShowChannelSettings(false);
      setTimelineTab('events');
    }
  }, [selectedProjectId, projects, fetchProjectChannels, fetchChannelMessages, fetchOrgChannels]);

  // ========================================
  // プロジェクト作成
  // ========================================
  const createProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProjectName.trim(),
          description: newProjectDesc.trim() || null,
          organizationId: newProjectOrgId || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowNewProject(false);
        setNewProjectName('');
        setNewProjectDesc('');
        setNewProjectOrgId('');
        fetchProjects();
        showMsg('success', 'プロジェクトを作成しました');
      } else {
        showMsg('error', data.error || '作成に失敗しました');
      }
    } catch { showMsg('error', '通信エラー'); }
  };

  // ========================================
  // イベント作成（Phase 33: 議事録・意思決定ログ対応）
  // ========================================
  const createEvent = async () => {
    if (!newEventTitle.trim()) return;

    // Phase 33: 議事録・意思決定ログ・参加者をcontentに統合
    let fullContent = newEventContent.trim();
    if (newEventParticipants.length > 0) {
      const names = newEventParticipants
        .map((id) => contacts.find((c) => c.id === id)?.name || id)
        .join(', ');
      fullContent = `【参加者】${names}\n\n${fullContent}`;
    }
    if (newEventMinutes.trim()) {
      fullContent += `\n\n【議事録】\n${newEventMinutes.trim()}`;
    }
    if (newEventDecision.trim()) {
      fullContent += `\n\n【意思決定】\n${newEventDecision.trim()}`;
    }

    try {
      const res = await fetch('/api/business-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newEventTitle.trim(),
          content: fullContent || null,
          eventType: newEventType,
          projectId: selectedProjectId || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowNewEvent(false);
        resetNewEventForm();
        fetchEvents();
        showMsg('success', 'イベントを記録しました');
      } else {
        showMsg('error', data.error || '作成に失敗しました');
      }
    } catch { showMsg('error', '通信エラー'); }
  };

  const resetNewEventForm = () => {
    setNewEventTitle('');
    setNewEventContent('');
    setNewEventType('note');
    setNewEventMinutes('');
    setNewEventDecision('');
    setNewEventParticipants([]);
  };

  // ========================================
  // Phase 33: イベント更新
  // ========================================
  const updateEvent = async () => {
    if (!selectedEvent || !editTitle.trim()) return;
    try {
      const res = await fetch(`/api/business-events/${selectedEvent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          content: editContent.trim() || null,
          eventType: editEventType,
          projectId: selectedEvent.project_id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsEditing(false);
        setSelectedEvent(data.data);
        fetchEvents();
        showMsg('success', 'イベントを更新しました');
      } else {
        showMsg('error', data.error || '更新に失敗しました');
      }
    } catch { showMsg('error', '通信エラー'); }
  };

  // ========================================
  // Phase 33: イベント削除
  // ========================================
  const deleteEvent = async () => {
    if (!selectedEvent) return;
    try {
      const res = await fetch(`/api/business-events/${selectedEvent.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setSelectedEvent(null);
        setShowDeleteConfirm(false);
        fetchEvents();
        showMsg('success', 'イベントを削除しました');
      } else {
        showMsg('error', data.error || '削除に失敗しました');
      }
    } catch { showMsg('error', '通信エラー'); }
  };

  // Phase 33: 編集モード開始
  const startEditing = () => {
    if (!selectedEvent) return;
    setEditTitle(selectedEvent.title);
    setEditContent(selectedEvent.content || '');
    setEditEventType(selectedEvent.event_type);
    setIsEditing(true);
  };

  // Phase 33: 参加者トグル
  const toggleParticipant = (contactId: string) => {
    setNewEventParticipants((prev) =>
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId]
    );
  };

  const eventsByDate = groupEventsByDate(events);
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <AppLayout>
      <ContextBar
        title="ビジネスログ"
        actions={[
          {
            label: 'プロジェクト追加',
            icon: Plus,
            onClick: () => setShowNewProject(!showNewProject),
            variant: 'ghost',
            size: 'sm',
          },
          {
            label: 'イベント記録',
            icon: Plus,
            onClick: () => { setShowNewEvent(true); setSelectedEvent(null); setIsEditing(false); },
            variant: 'primary',
            size: 'sm',
          },
        ]}
      />
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* ページヘッダー */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-slate-600" />
              <h1 className="text-lg font-bold text-slate-900">
                {selectedProject ? selectedProject.name : 'ビジネスログ'}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {selectedProject && (
                <Button
                  onClick={() => setShowChannelSettings(!showChannelSettings)}
                  icon={Link2}
                  size="sm"
                  variant={showChannelSettings ? 'primary' : 'outline'}
                  title="チャネル設定"
                >
                  チャネル {projectChannels.length > 0 && `(${projectChannels.length})`}
                </Button>
              )}
            </div>
          </div>
          {selectedProject?.description && (
            <p className="text-xs text-slate-500">{selectedProject.description}</p>
          )}
        </div>

        {/* メッセージバナー */}
        {message && (
          <div className={`mx-6 mt-2 px-3 py-2 rounded-lg text-xs font-medium ${
            message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* 3カラムレイアウト */}
        <div className="flex-1 overflow-hidden flex">
          {/* ========================================
              左サイドバー: プロジェクト一覧
              ======================================== */}
          <aside className="w-56 border-r border-slate-200 bg-slate-50 flex flex-col shrink-0">
            <div className="px-4 py-3 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">プロジェクト</h2>
                <Button
                  onClick={() => setShowNewProject(!showNewProject)}
                  icon={Plus}
                  variant="ghost"
                  size="sm"
                  title="プロジェクト追加"
                />
              </div>
            </div>

            {/* 新規プロジェクトフォーム */}
            {showNewProject && (
              <Card variant="outlined" padding="sm" className="mx-3 my-3 border-b">
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="プロジェクト名"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                  autoFocus
                />
                <input
                  type="text"
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="説明（任意）"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                />
                <select
                  value={newProjectOrgId}
                  onChange={(e) => setNewProjectOrgId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2 bg-white"
                >
                  <option value="">組織を選択（任意）</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
                <div className="flex gap-1.5">
                  <Button
                    onClick={createProject}
                    variant="primary"
                    size="sm"
                    className="flex-1"
                  >
                    作成
                  </Button>
                  <Button
                    onClick={() => { setShowNewProject(false); setNewProjectName(''); setNewProjectDesc(''); setNewProjectOrgId(''); }}
                    variant="outline"
                    size="sm"
                  >
                    取消
                  </Button>
                </div>
              </Card>
            )}

            {/* プロジェクト一覧 */}
            <div className="flex-1 overflow-y-auto">
              <button
                onClick={() => setSelectedProjectId(null)}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors ${
                  !selectedProjectId ? 'bg-white text-slate-900 font-medium shadow-sm border-l-2 border-blue-600' : 'text-slate-600 hover:bg-white'
                }`}
              >
                <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                すべてのイベント
              </button>

              {isLoadingProjects ? (
                <div className="px-4 py-6 text-center text-slate-400 text-xs">読み込み中...</div>
              ) : projects.length === 0 ? (
                <div className="px-4 py-6 text-center text-slate-400 text-xs">プロジェクトなし</div>
              ) : (
                projects.map((project) => {
                  const statusConfig = PROJECT_STATUS_LABELS[project.status] || PROJECT_STATUS_LABELS.active;
                  return (
                    <button
                      key={project.id}
                      onClick={() => setSelectedProjectId(project.id)}
                      className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors ${
                        selectedProjectId === project.id
                          ? 'bg-white text-slate-900 font-medium shadow-sm'
                          : 'text-slate-600 hover:bg-white'
                      }`}
                    >
                      <FolderOpen className="w-4 h-4 text-blue-500 shrink-0" />
                      <div className="truncate flex-1">
                        <span className="block truncate">{project.name}</span>
                        {project.organization_name && (
                          <span className="block text-[10px] text-slate-400 truncate">{project.organization_name}</span>
                        )}
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${statusConfig.color}`}>
                        {statusConfig.label}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* ========================================
              中央: タイムライン
              ======================================== */}
          <div className={`flex-1 overflow-y-auto ${selectedEvent ? 'border-r border-slate-200' : ''}`}>
            {/* Phase 40c: チャネル設定パネル */}
            {showChannelSettings && selectedProjectId && (
              <Card variant="default" padding="md" className="mx-6 mt-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700">チャネル紐づけ設定</h3>
                  <Button
                    onClick={() => setShowChannelSettings(false)}
                    icon={X}
                    variant="ghost"
                    size="sm"
                  />
                </div>

                {/* 紐づけ済みチャネル */}
                {projectChannels.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">紐づけ済み</p>
                    <div className="space-y-1">
                      {projectChannels.map((ch) => (
                        <div key={ch.id} className="flex items-center justify-between px-2.5 py-1.5 bg-blue-50 border border-blue-100 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Hash className="w-3 h-3 text-blue-500" />
                            <span className="text-xs text-slate-700">{ch.channel_label || ch.channel_identifier}</span>
                            <span className="text-[10px] text-slate-400">{ch.service_name}</span>
                          </div>
                          <Button
                            onClick={() => removeProjectChannel(ch.id)}
                            icon={X}
                            variant="ghost"
                            size="xs"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 組織のチャネルから追加 */}
                {orgChannels.length > 0 ? (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">組織のチャネルから追加</p>
                    <div className="space-y-1">
                      {orgChannels
                        .filter((oc) => !projectChannels.some(
                          (pc) => pc.service_name === oc.service_name && pc.channel_identifier === oc.channel_id
                        ))
                        .map((oc) => (
                          <Button
                            key={oc.id}
                            onClick={() => addProjectChannel(oc)}
                            variant="outline"
                            size="sm"
                            className="w-full justify-between px-2.5 py-1.5"
                          >
                            <div className="flex items-center gap-2">
                              <Hash className="w-3 h-3 text-slate-400" />
                              <span className="text-xs text-slate-600">{oc.channel_name || oc.channel_id}</span>
                              <span className="text-[10px] text-slate-400">{oc.service_name}</span>
                            </div>
                            <Plus className="w-3 h-3 text-blue-500" />
                          </Button>
                        ))}
                      {orgChannels.filter((oc) => !projectChannels.some(
                        (pc) => pc.service_name === oc.service_name && pc.channel_identifier === oc.channel_id
                      )).length === 0 && (
                        <p className="text-xs text-slate-400 px-2">すべてのチャネルが紐づけ済みです</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    {selectedProject?.organization_id
                      ? '組織にチャネルが登録されていません。組織詳細ページでチャネルを追加してください。'
                      : 'プロジェクトに組織を設定すると、組織のチャネルから選択できます。'}
                  </p>
                )}
              </Card>
            )}

            {/* Phase 40c: タイムラインタブ（プロジェクト選択時のみ） */}
            {selectedProjectId && projectChannels.length > 0 && (
              <div className="mx-6 mt-3 flex gap-1 border-b border-slate-200">
                <button
                  onClick={() => setTimelineTab('events')}
                  className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                    timelineTab === 'events'
                      ? 'text-blue-600 border-blue-600'
                      : 'text-slate-500 border-transparent hover:text-slate-700'
                  }`}
                >
                  イベント
                </button>
                <button
                  onClick={() => setTimelineTab('messages')}
                  className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                    timelineTab === 'messages'
                      ? 'text-blue-600 border-blue-600'
                      : 'text-slate-500 border-transparent hover:text-slate-700'
                  }`}
                >
                  チャネルメッセージ {channelMessages.length > 0 && `(${channelMessages.length})`}
                </button>
              </div>
            )}

            {/* Phase 33: 新規イベントフォーム（強化版） */}
            {showNewEvent && (
              <Card variant="default" padding="md" className="mx-6 mt-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700">新しいイベントを記録</h3>
                  <Button
                    onClick={() => { setShowNewEvent(false); resetNewEventForm(); }}
                    icon={X}
                    variant="ghost"
                    size="sm"
                  />
                </div>
                <div className="space-y-3">
                  {/* イベント種別 */}
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(EVENT_TYPE_CONFIG).map(([key, config]) => {
                      const Icon = config.icon;
                      return (
                        <button
                          key={key}
                          onClick={() => setNewEventType(key)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                            newEventType === key ? 'ring-2 ring-offset-1 ring-blue-400' : ''
                          } ${config.color}`}
                        >
                          <Icon className="w-3 h-3" />
                          {config.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* タイトル */}
                  <input
                    type="text"
                    value={newEventTitle}
                    onChange={(e) => setNewEventTitle(e.target.value)}
                    placeholder="タイトル"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />

                  {/* 詳細 */}
                  <textarea
                    value={newEventContent}
                    onChange={(e) => setNewEventContent(e.target.value)}
                    placeholder="詳細（任意）"
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />

                  {/* Phase 33: 参加者選択 */}
                  {(newEventType === 'meeting' || newEventType === 'call') && contacts.length > 0 && (
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1.5">
                        <Users className="w-3.5 h-3.5" />
                        参加者
                      </label>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                        {contacts.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => toggleParticipant(c.id)}
                            className={`px-2 py-1 rounded-full text-xs transition-colors ${
                              newEventParticipants.includes(c.id)
                                ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {c.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Phase 33: 議事録入力 */}
                  {newEventType === 'meeting' && (
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1.5">
                        <FileText className="w-3.5 h-3.5" />
                        議事録
                      </label>
                      <textarea
                        value={newEventMinutes}
                        onChange={(e) => setNewEventMinutes(e.target.value)}
                        placeholder="議事の内容を記録..."
                        rows={4}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                    </div>
                  )}

                  {/* Phase 33: 意思決定ログ */}
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1.5">
                      <Bookmark className="w-3.5 h-3.5" />
                      意思決定ログ（任意）
                    </label>
                    <textarea
                      value={newEventDecision}
                      onChange={(e) => setNewEventDecision(e.target.value)}
                      placeholder="決定事項があれば記録..."
                      rows={2}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>

                  {/* 送信ボタン */}
                  <div className="flex justify-end gap-2">
                    <Button
                      onClick={() => { setShowNewEvent(false); resetNewEventForm(); }}
                      variant="outline"
                      size="sm"
                    >
                      キャンセル
                    </Button>
                    <Button
                      onClick={createEvent}
                      disabled={!newEventTitle.trim()}
                      variant="primary"
                      size="sm"
                    >
                      記録する
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* タイムライン本体 */}
            {timelineTab === 'events' ? (
              <div className="px-6 py-4">
                {isLoadingEvents ? (
                  <LoadingState message="読み込み中..." />
                ) : events.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-slate-400">
                    <div className="text-center">
                      <Clock className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p className="text-sm">イベントがありません</p>
                      <p className="text-xs mt-1">「イベント記録」ボタンで最初のイベントを記録しましょう</p>
                    </div>
                  </div>
                ) : (
                  Array.from(eventsByDate.entries()).map(([date, dayEvents]) => (
                    <div key={date} className="mb-6">
                      {/* 日付ヘッダー */}
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-xs font-semibold text-slate-500">{date}</span>
                        <div className="flex-1 h-px bg-slate-200" />
                      </div>

                      {/* イベント一覧 */}
                      <div className="space-y-2 ml-2">
                        {dayEvents.map((event) => {
                          const typeConfig = EVENT_TYPE_CONFIG[event.event_type] || EVENT_TYPE_CONFIG.note;
                          const Icon = typeConfig.icon;
                          const isSelected = selectedEvent?.id === event.id;
                          return (
                            <Card
                              key={event.id}
                              variant={isSelected ? 'default' : 'outlined'}
                              padding="md"
                              hoverable
                              onClick={() => { setSelectedEvent(isSelected ? null : event); setIsEditing(false); setShowDeleteConfirm(false); }}
                              className={`w-full flex items-start gap-3 text-left cursor-pointer transition-colors ${
                                isSelected ? 'bg-blue-50 border border-blue-200' : ''
                              }`}
                            >
                              <div className="flex flex-col items-center mt-0.5">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${typeConfig.color}`}>
                                  <Icon className="w-3.5 h-3.5" />
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-slate-900 truncate">{event.title}</span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${typeConfig.color}`}>
                                    {typeConfig.label}
                                  </span>
                                </div>
                                {event.content && (
                                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{event.content}</p>
                                )}
                                <span className="text-[10px] text-slate-400 mt-1 block">
                                  {formatDateTime(event.created_at)}
                                </span>
                              </div>
                              <ChevronRight className={`w-4 h-4 shrink-0 mt-1 transition-colors ${
                                isSelected ? 'text-blue-500' : 'text-slate-300'
                              }`} />
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              /* Phase 40c: チャネルメッセージ表示 */
              <div className="px-6 py-4">
                {isLoadingMessages ? (
                  <LoadingState message="メッセージ読み込み中..." />
                ) : channelMessages.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-slate-400">
                    <div className="text-center">
                      <MessageSquare className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p className="text-sm">メッセージがありません</p>
                      <p className="text-xs mt-1">紐づけたチャネルにメッセージが届くとここに表示されます</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {channelMessages.map((msg) => {
                      const isSent = msg.direction === 'sent';
                      const serviceName = msg.channel || msg.metadata?.service || '';
                      const serviceIcon = serviceName === 'slack' ? '#' : serviceName === 'chatwork' ? 'CW' : '@';
                      return (
                        <div
                          key={msg.id}
                          className={`p-3 rounded-lg border transition-colors ${
                            isSent ? 'bg-blue-50 border-blue-100' : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                              {serviceIcon}
                            </span>
                            <span className="text-xs font-medium text-slate-700">
                              {isSent ? 'あなた' : (msg.from_name || msg.from_address || '不明')}
                            </span>
                            {isSent && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600">送信</span>
                            )}
                            <span className="text-[10px] text-slate-400 ml-auto">
                              {formatDateTime(msg.timestamp)}
                            </span>
                          </div>
                          {msg.subject && (
                            <p className="text-xs font-medium text-slate-800 mb-0.5">{msg.subject}</p>
                          )}
                          {msg.body && (
                            <p className="text-xs text-slate-600 line-clamp-3 whitespace-pre-wrap">{msg.body}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ========================================
              右パネル: イベント詳細（Phase 33: 編集・削除対応）
              ======================================== */}
          {selectedEvent && (
            <Card variant="flat" className="w-80 overflow-y-auto bg-slate-50 shrink-0">
              {/* Phase 33: 編集モード */}
              {isEditing ? (
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-slate-900">イベント編集</h3>
                    <Button
                      onClick={() => setIsEditing(false)}
                      icon={X}
                      variant="ghost"
                      size="sm"
                    />
                  </div>

                  <div className="space-y-3">
                    {/* 種別 */}
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(EVENT_TYPE_CONFIG).map(([key, config]) => {
                        const Icon = config.icon;
                        return (
                          <button
                            key={key}
                            onClick={() => setEditEventType(key)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                              editEventType === key ? 'ring-2 ring-offset-1 ring-blue-400' : ''
                            } ${config.color}`}
                          >
                            <Icon className="w-2.5 h-2.5" />
                            {config.label}
                          </button>
                        );
                      })}
                    </div>

                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={8}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={updateEvent}
                        disabled={!editTitle.trim()}
                        variant="primary"
                        size="sm"
                        className="flex-1"
                      >
                        保存
                      </Button>
                      <Button
                        onClick={() => setIsEditing(false)}
                        variant="outline"
                        size="sm"
                      >
                        取消
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-5">
                  {/* ヘッダー + アクションボタン */}
                  <div className="border-b border-slate-200 flex items-start justify-between pb-4 mb-4">
                    <h3 className="text-base font-bold text-slate-900 pr-2">{selectedEvent.title}</h3>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        onClick={startEditing}
                        icon={Pencil}
                        variant="ghost"
                        size="sm"
                        title="編集"
                      />
                      <Button
                        onClick={() => setShowDeleteConfirm(true)}
                        icon={Trash2}
                        variant="ghost"
                        size="sm"
                        title="削除"
                      />
                      <Button
                        onClick={() => { setSelectedEvent(null); setShowDeleteConfirm(false); }}
                        icon={X}
                        variant="ghost"
                        size="sm"
                      />
                    </div>
                  </div>

                  {/* Phase 33: 削除確認 */}
                  {showDeleteConfirm && (
                    <Card variant="outlined" padding="md" className="mb-4 bg-red-50 border-red-200">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                        <span className="text-xs font-medium text-red-700">このイベントを削除しますか？</span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={deleteEvent}
                          variant="danger"
                          size="sm"
                          className="flex-1"
                        >
                          削除する
                        </Button>
                        <Button
                          onClick={() => setShowDeleteConfirm(false)}
                          variant="outline"
                          size="sm"
                        >
                          取消
                        </Button>
                      </div>
                    </Card>
                  )}

                  {/* タイプバッジ */}
                  {(() => {
                    const typeConfig = EVENT_TYPE_CONFIG[selectedEvent.event_type] || EVENT_TYPE_CONFIG.note;
                    const Icon = typeConfig.icon;
                    return (
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium mb-4 ${typeConfig.color}`}>
                        <Icon className="w-3.5 h-3.5" />
                        {typeConfig.label}
                      </div>
                    );
                  })()}

                  {/* 日時 */}
                  <div className="mb-4">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">日時</label>
                    <p className="text-sm text-slate-700 mt-0.5">{formatDateTime(selectedEvent.created_at)}</p>
                  </div>

                  {/* 内容 */}
                  {selectedEvent.content && (
                    <div className="mb-4">
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">詳細</label>
                      <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap leading-relaxed">{selectedEvent.content}</p>
                    </div>
                  )}

                  {/* プロジェクト */}
                  {selectedEvent.project_id && selectedProject && (
                    <div className="mb-4">
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">プロジェクト</label>
                      <div className="flex items-center gap-2 mt-1">
                        <FolderOpen className="w-4 h-4 text-blue-500" />
                        <span className="text-sm text-slate-700">{selectedProject.name}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
