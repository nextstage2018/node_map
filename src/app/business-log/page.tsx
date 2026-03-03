// Phase 46: ビジネスログ — コンポーネント分割 + AI強化 + ダッシュボード
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, ClipboardList, Link2 } from 'lucide-react';
import AppLayout from '@/components/shared/AppLayout';
import ContextBar from '@/components/shared/ContextBar';
import Button from '@/components/ui/Button';

import ProjectSidebar from '@/components/business-log/ProjectSidebar';
import EventTimeline from '@/components/business-log/EventTimeline';
import EventForm from '@/components/business-log/EventForm';
import EventDetail from '@/components/business-log/EventDetail';
import { ChannelSettings, ChannelMessagesList, DocumentList } from '@/components/business-log/ChannelPanel';
import Dashboard from '@/components/business-log/Dashboard';
import {
  Organization, Project, ProjectChannel, ChannelMessage,
  BusinessEvent, ContactOption,
} from '@/components/business-log/types';

export default function BusinessLogPage() {
  // プロジェクト
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);

  // イベント
  const [events, setEvents] = useState<BusinessEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<BusinessEvent | null>(null);
  const [autoSuggestEventId, setAutoSuggestEventId] = useState<string | null>(null);

  // コンタクト・組織
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  // チャネル・メッセージ
  const [projectChannels, setProjectChannels] = useState<ProjectChannel[]>([]);
  const [channelMessages, setChannelMessages] = useState<ChannelMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [showChannelSettings, setShowChannelSettings] = useState(false);
  const [orgChannels, setOrgChannels] = useState<any[]>([]);
  const [timelineTab, setTimelineTab] = useState<'events' | 'messages' | 'documents'>('events');
  const [projectDocuments, setProjectDocuments] = useState<any[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);

  // フォーム
  const [showNewEvent, setShowNewEvent] = useState(false);

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
    } catch { /* ignore */ }
    finally { setIsLoadingProjects(false); }
  }, []);

  const fetchEvents = useCallback(async () => {
    if (!selectedProjectId) return; // ダッシュボードモードでは不要
    setIsLoadingEvents(true);
    try {
      const params = new URLSearchParams();
      if (selectedProjectId) params.set('project_id', selectedProjectId);
      const res = await fetch(`/api/business-events?${params}`);
      const data = await res.json();
      if (data.success) setEvents(data.data || []);
    } catch { /* ignore */ }
    finally { setIsLoadingEvents(false); }
  }, [selectedProjectId]);

  const fetchOrganizations = useCallback(async () => {
    try {
      const res = await fetch('/api/organizations');
      const data = await res.json();
      if (data.success && data.data) {
        setOrganizations(data.data.map((o: any) => ({ id: o.id, name: o.name, relationship_type: o.relationship_type })));
      }
    } catch { /* ignore */ }
  }, []);

  const fetchProjectChannels = useCallback(async (projId: string) => {
    try {
      const res = await fetch(`/api/projects/${projId}/channels`);
      const data = await res.json();
      if (data.success) setProjectChannels(data.data || []);
      else setProjectChannels([]);
    } catch { setProjectChannels([]); }
  }, []);

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

  const fetchOrgChannels = useCallback(async (orgId: string) => {
    try {
      const res = await fetch(`/api/organizations/${orgId}/channels`);
      const data = await res.json();
      if (data.success) setOrgChannels(data.data || []);
      else setOrgChannels([]);
    } catch { setOrgChannels([]); }
  }, []);

  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts');
      const data = await res.json();
      if (data.success && data.data) {
        setContacts(data.data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchProjects(); fetchContacts(); fetchOrganizations(); }, [fetchProjects, fetchContacts, fetchOrganizations]);
  useEffect(() => { if (selectedProjectId) fetchEvents(); }, [fetchEvents, selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId) {
      fetchProjectChannels(selectedProjectId);
      fetchChannelMessages(selectedProjectId);
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
  // アクション
  // ========================================
  const handleCreateProject = async (name: string, description: string, orgId: string, projectTypeId?: string) => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: description || null, organizationId: orgId || null, projectTypeId: projectTypeId || null }),
      });
      const data = await res.json();
      if (data.success) {
        fetchProjects();
        const taskMsg = data.generatedTaskCount ? ` （定型タスク${data.generatedTaskCount}件を自動生成しました）` : '';
        showMsg('success', `プロジェクトを作成しました${taskMsg}`);
      }
      else showMsg('error', data.error || '作成に失敗しました');
    } catch { showMsg('error', '通信エラー'); }
  };

  const handleCreateEvent = async (formData: {
    title: string; content: string; eventType: string;
    participants: string[];
    calendarEventId?: string; meetingNotesUrl?: string;
    eventStart?: string; eventEnd?: string;
  }) => {
    let fullContent = formData.content.trim();
    if (formData.participants.length > 0) {
      const names = formData.participants.map((id) => contacts.find((c) => c.id === id)?.name || id).join(', ');
      fullContent = `【参加者】${names}\n\n${fullContent}`;
    }
    if (formData.meetingNotesUrl) {
      fullContent += `\n\n【議事録】\n${formData.meetingNotesUrl}`;
    }

    try {
      const res = await fetch('/api/business-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title.trim(),
          content: fullContent || null,
          eventType: formData.eventType,
          projectId: selectedProjectId || null,
          sourceCalendarEventId: formData.calendarEventId || null,
          meetingNotesUrl: formData.meetingNotesUrl || null,
          eventStart: formData.eventStart || null,
          eventEnd: formData.eventEnd || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowNewEvent(false);
        fetchEvents();
        showMsg('success', 'イベントを記録しました');
        // Phase 56: 会議系イベントの場合、自動でタスク提案を取得してEventDetailを表示
        const meetingTypes = ['meeting', 'call', 'calendar_meeting', 'decision'];
        if (data.data?.id && meetingTypes.includes(formData.eventType) && formData.content.trim()) {
          setSelectedEvent(data.data);
          // 少し遅延してからsuggest-tasks APIを呼び出し（EventDetailに提案自動表示）
          setTimeout(() => {
            setAutoSuggestEventId(data.data.id);
          }, 500);
        }
      }
      else showMsg('error', data.error || '作成に失敗しました');
    } catch { showMsg('error', '通信エラー'); }
  };

  const handleUpdateEvent = async (data: { title: string; content: string; eventType: string }) => {
    if (!selectedEvent) return;
    try {
      const res = await fetch(`/api/business-events/${selectedEvent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: data.title, content: data.content || null, eventType: data.eventType, projectId: selectedEvent.project_id }),
      });
      const result = await res.json();
      if (result.success) { setSelectedEvent(result.data); fetchEvents(); showMsg('success', 'イベントを更新しました'); }
      else showMsg('error', result.error || '更新に失敗しました');
    } catch { showMsg('error', '通信エラー'); }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return;
    try {
      const res = await fetch(`/api/business-events/${selectedEvent.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { setSelectedEvent(null); fetchEvents(); showMsg('success', 'イベントを削除しました'); }
      else showMsg('error', data.error || '削除に失敗しました');
    } catch { showMsg('error', '通信エラー'); }
  };

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
      if (data.success) { fetchProjectChannels(selectedProjectId); fetchChannelMessages(selectedProjectId); showMsg('success', 'チャネルを紐づけました'); }
      else showMsg('error', data.error || '追加に失敗しました');
    } catch { showMsg('error', '通信エラー'); }
  };

  const removeProjectChannel = async (channelDbId: string) => {
    if (!selectedProjectId) return;
    try {
      const res = await fetch(`/api/projects/${selectedProjectId}/channels?channelId=${channelDbId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { fetchProjectChannels(selectedProjectId); fetchChannelMessages(selectedProjectId); showMsg('success', 'チャネルの紐づけを解除しました'); }
      else showMsg('error', data.error || '削除に失敗しました');
    } catch { showMsg('error', '通信エラー'); }
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;

  return (
    <AppLayout>
      <ContextBar
        title="ビジネスログ"
        actions={
          <>
            <Button variant="primary" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => { setShowNewEvent(true); setSelectedEvent(null); }}>
              イベント記録
            </Button>
          </>
        }
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
              {!selectedProjectId && (
                <span className="text-xs text-slate-400 ml-2">全体ダッシュボード</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selectedProject && (
                <Button
                  onClick={() => setShowChannelSettings(!showChannelSettings)}
                  icon={<Link2 className="w-4 h-4" />}
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
          {/* 左サイドバー */}
          <ProjectSidebar
            projects={projects}
            organizations={organizations}
            selectedProjectId={selectedProjectId}
            isLoading={isLoadingProjects}
            onSelectProject={(id) => { setSelectedProjectId(id); setSelectedEvent(null); setShowNewEvent(false); }}
            onCreateProject={handleCreateProject}
          />

          {/* 中央エリア */}
          <div className={`flex-1 overflow-y-auto ${selectedEvent ? 'border-r border-slate-200' : ''}`}>
            {!selectedProjectId ? (
              // ダッシュボード表示
              <Dashboard
                projects={projects}
                onSelectProject={(id) => { setSelectedProjectId(id); setSelectedEvent(null); }}
              />
            ) : (
              <>
                {/* チャネル設定パネル */}
                {showChannelSettings && selectedProjectId && (
                  <ChannelSettings
                    projectChannels={projectChannels}
                    orgChannels={orgChannels}
                    hasOrganization={!!selectedProject?.organization_id}
                    onAdd={addProjectChannel}
                    onRemove={removeProjectChannel}
                    onClose={() => setShowChannelSettings(false)}
                  />
                )}

                {/* タブ */}
                {selectedProjectId && projectChannels.length > 0 && (
                  <div className="mx-6 mt-3 flex gap-1 border-b border-slate-200">
                    <button
                      onClick={() => setTimelineTab('events')}
                      className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                        timelineTab === 'events' ? 'text-blue-600 border-blue-600' : 'text-slate-500 border-transparent hover:text-slate-700'
                      }`}
                    >
                      イベント
                    </button>
                    <button
                      onClick={() => setTimelineTab('messages')}
                      className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                        timelineTab === 'messages' ? 'text-blue-600 border-blue-600' : 'text-slate-500 border-transparent hover:text-slate-700'
                      }`}
                    >
                      チャネルメッセージ {channelMessages.length > 0 && `(${channelMessages.length})`}
                    </button>
                    <button
                      onClick={() => {
                        setTimelineTab('documents');
                        if (selectedProjectId && projectDocuments.length === 0 && !isLoadingDocuments) {
                          setIsLoadingDocuments(true);
                          fetch(`/api/drive/documents?projectId=${selectedProjectId}`)
                            .then(r => r.json())
                            .then(d => { if (d.success) setProjectDocuments(d.data || []); })
                            .catch(() => {})
                            .finally(() => setIsLoadingDocuments(false));
                        }
                      }}
                      className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                        timelineTab === 'documents' ? 'text-blue-600 border-blue-600' : 'text-slate-500 border-transparent hover:text-slate-700'
                      }`}
                    >
                      ドキュメント {projectDocuments.length > 0 && `(${projectDocuments.length})`}
                    </button>
                  </div>
                )}

                {/* イベント記録フォーム */}
                {showNewEvent && (
                  <EventForm
                    contacts={contacts}
                    projectId={selectedProjectId}
                    onSubmit={handleCreateEvent}
                    onClose={() => setShowNewEvent(false)}
                  />
                )}

                {/* タブコンテンツ */}
                {timelineTab === 'events' ? (
                  <EventTimeline
                    events={events}
                    isLoading={isLoadingEvents}
                    selectedEventId={selectedEvent?.id || null}
                    onSelectEvent={setSelectedEvent}
                  />
                ) : timelineTab === 'messages' ? (
                  <ChannelMessagesList messages={channelMessages} isLoading={isLoadingMessages} />
                ) : timelineTab === 'documents' ? (
                  <DocumentList documents={projectDocuments} isLoading={isLoadingDocuments} />
                ) : null}
              </>
            )}
          </div>

          {/* 右パネル: イベント詳細 */}
          {selectedEvent && (
            <EventDetail
              event={selectedEvent}
              project={selectedProject}
              onClose={() => setSelectedEvent(null)}
              onUpdate={handleUpdateEvent}
              onDelete={handleDeleteEvent}
              autoSuggest={autoSuggestEventId === selectedEvent.id}
              onAutoSuggestDone={() => setAutoSuggestEventId(null)}
            />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
