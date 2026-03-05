// Phase D: 組織詳細 > プロジェクト一覧 + プロジェクト詳細（タスク|ドキュメント|ビジネスログ）
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FolderOpen, Plus, ChevronRight, ArrowLeft, CheckSquare,
  FileText, ClipboardList, Link2, Clock, X, AlertTriangle,
} from 'lucide-react';
import EventTimeline from '@/components/business-log/EventTimeline';
import EventForm from '@/components/business-log/EventForm';
import EventDetail from '@/components/business-log/EventDetail';
import { ChannelMessagesList, DocumentList } from '@/components/business-log/ChannelPanel';
import {
  Project, ProjectChannel, ChannelMessage,
  BusinessEvent, ContactOption, PROJECT_STATUS_LABELS,
} from '@/components/business-log/types';

// ========================================
// 型定義
// ========================================
interface UnlinkedChannel {
  service_name: string;
  channel_identifier: string;
  channel_name: string;
  message_count: number;
  last_message_at: string;
}

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  phase: string;
  created_at: string;
}

interface ProjectsTabProps {
  orgId: string;
  orgName: string;
}

// ========================================
// プロジェクト一覧
// ========================================
function ProjectList({
  projects,
  isLoading,
  onSelectProject,
  onCreateProject,
  unlinkedChannels,
  onLinkChannel,
}: {
  projects: Project[];
  isLoading: boolean;
  onSelectProject: (project: Project) => void;
  onCreateProject: (name: string, description: string) => void;
  unlinkedChannels: UnlinkedChannel[];
  onLinkChannel: (channel: UnlinkedChannel, projectId: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [showLinkPanel, setShowLinkPanel] = useState<UnlinkedChannel | null>(null);

  const handleCreate = () => {
    if (!newName.trim()) return;
    onCreateProject(newName.trim(), newDesc.trim());
    setNewName('');
    setNewDesc('');
    setShowForm(false);
  };

  return (
    <div className="space-y-4">
      {/* 未紐づけチャネル通知 */}
      {unlinkedChannels.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-medium text-amber-800">
              プロジェクト未紐づけのチャネルがあります（{unlinkedChannels.length}件）
            </span>
          </div>
          <div className="space-y-1.5">
            {unlinkedChannels.map((ch) => (
              <div key={`${ch.service_name}-${ch.channel_identifier}`} className="flex items-center justify-between bg-white rounded px-2.5 py-1.5 border border-amber-100">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    ch.service_name === 'slack' ? 'bg-purple-50 text-purple-700' : 'bg-green-50 text-green-700'
                  }`}>
                    {ch.service_name === 'slack' ? 'Slack' : 'CW'}
                  </span>
                  <span className="text-xs text-slate-700">{ch.channel_name || ch.channel_identifier}</span>
                  <span className="text-[10px] text-slate-400">{ch.message_count}件</span>
                </div>
                <button
                  onClick={() => setShowLinkPanel(ch)}
                  className="text-[10px] px-2 py-0.5 text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                >
                  紐づけ
                </button>
              </div>
            ))}
          </div>

          {/* 紐づけ先選択パネル */}
          {showLinkPanel && (
            <div className="mt-2 p-2 bg-white rounded-lg border border-amber-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-700">
                  「{showLinkPanel.channel_name || showLinkPanel.channel_identifier}」の紐づけ先:
                </span>
                <button onClick={() => setShowLinkPanel(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { onLinkChannel(showLinkPanel, p.id); setShowLinkPanel(null); }}
                    className="w-full text-left px-2 py-1.5 text-xs text-slate-700 rounded hover:bg-slate-50 transition-colors"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">この組織のプロジェクトを管理します</p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          新規プロジェクト
        </button>
      </div>

      {/* 作成フォーム */}
      {showForm && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="プロジェクト名"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="説明（任意）"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              作成
            </button>
            <button
              onClick={() => { setShowForm(false); setNewName(''); setNewDesc(''); }}
              className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* プロジェクト一覧 */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-slate-400">
          <div className="text-center">
            <div className="animate-spin text-2xl mb-2">&#8987;</div>
            <p className="text-sm">読み込み中...</p>
          </div>
        </div>
      ) : projects.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-slate-400">
          <div className="text-center">
            <FolderOpen className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs">プロジェクトがありません</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((p) => {
            const statusConfig = PROJECT_STATUS_LABELS[p.status] || PROJECT_STATUS_LABELS.active;
            return (
              <button
                key={p.id}
                onClick={() => onSelectProject(p)}
                className="w-full flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <FolderOpen className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900 truncate">{p.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${statusConfig.color}`}>
                      {statusConfig.label}
                    </span>
                  </div>
                  {p.description && (
                    <p className="text-xs text-slate-500 truncate mt-0.5">{p.description}</p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ========================================
// プロジェクト詳細パネル（タスク|ドキュメント|ビジネスログ）
// ========================================
function ProjectDetailPanel({
  project,
  orgId,
  onBack,
}: {
  project: Project;
  orgId: string;
  onBack: () => void;
}) {
  const [activeSubTab, setActiveSubTab] = useState<'tasks' | 'documents' | 'bizlog'>('tasks');

  // タスク
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);

  // ドキュメント
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);

  // ビジネスログ
  const [events, setEvents] = useState<BusinessEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<BusinessEvent | null>(null);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [autoSuggestEventId, setAutoSuggestEventId] = useState<string | null>(null);

  // チャネルメッセージ
  const [projectChannels, setProjectChannels] = useState<ProjectChannel[]>([]);
  const [channelMessages, setChannelMessages] = useState<ChannelMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // タスク取得
  const fetchTasks = useCallback(async () => {
    setIsLoadingTasks(true);
    try {
      const res = await fetch(`/api/tasks?project_id=${project.id}`);
      const data = await res.json();
      if (data.success) setTasks(data.data || []);
    } catch { /* ignore */ }
    finally { setIsLoadingTasks(false); }
  }, [project.id]);

  // ドキュメント取得
  const fetchDocuments = useCallback(async () => {
    setIsLoadingDocs(true);
    try {
      const res = await fetch(`/api/drive/documents?projectId=${project.id}`);
      const data = await res.json();
      if (data.success) setDocuments(data.data || []);
    } catch { /* ignore */ }
    finally { setIsLoadingDocs(false); }
  }, [project.id]);

  // ビジネスイベント取得
  const fetchEvents = useCallback(async () => {
    setIsLoadingEvents(true);
    try {
      const res = await fetch(`/api/business-events?project_id=${project.id}`);
      const data = await res.json();
      if (data.success) setEvents(data.data || []);
    } catch { /* ignore */ }
    finally { setIsLoadingEvents(false); }
  }, [project.id]);

  // プロジェクトチャネル取得
  const fetchProjectChannels = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/channels`);
      const data = await res.json();
      if (data.success) setProjectChannels(data.data || []);
    } catch { /* ignore */ }
  }, [project.id]);

  // チャネルメッセージ取得
  const fetchChannelMessages = useCallback(async () => {
    setIsLoadingMessages(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/messages?limit=100`);
      const data = await res.json();
      if (data.success) setChannelMessages(data.data || []);
    } catch { /* ignore */ }
    finally { setIsLoadingMessages(false); }
  }, [project.id]);

  // コンタクト取得
  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts');
      const data = await res.json();
      if (data.success && data.data) {
        setContacts(data.data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      }
    } catch { /* ignore */ }
  }, []);

  // 初期ロード
  useEffect(() => {
    fetchTasks();
    fetchProjectChannels();
    fetchContacts();
  }, [fetchTasks, fetchProjectChannels, fetchContacts]);

  // タブ切替時のデータロード
  useEffect(() => {
    if (activeSubTab === 'documents' && documents.length === 0) fetchDocuments();
    if (activeSubTab === 'bizlog' && events.length === 0) {
      fetchEvents();
      fetchChannelMessages();
    }
  }, [activeSubTab, documents.length, events.length, fetchDocuments, fetchEvents, fetchChannelMessages]);

  // ビジネスログイベント操作
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

    try {
      const res = await fetch('/api/business-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title.trim(),
          content: fullContent || null,
          eventType: formData.eventType,
          projectId: project.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowNewEvent(false);
        fetchEvents();
        const meetingTypes = ['meeting', 'call', 'calendar_meeting', 'decision'];
        if (data.data?.id && meetingTypes.includes(formData.eventType) && formData.content.trim()) {
          setSelectedEvent(data.data);
          setTimeout(() => setAutoSuggestEventId(data.data.id), 500);
        }
      }
    } catch { /* ignore */ }
  };

  const handleUpdateEvent = async (data: { title: string; content: string; eventType: string }) => {
    if (!selectedEvent) return;
    try {
      const res = await fetch(`/api/business-events/${selectedEvent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: data.title, content: data.content || null, eventType: data.eventType, projectId: project.id }),
      });
      const result = await res.json();
      if (result.success) { setSelectedEvent(result.data); fetchEvents(); }
    } catch { /* ignore */ }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return;
    try {
      const res = await fetch(`/api/business-events/${selectedEvent.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { setSelectedEvent(null); fetchEvents(); }
    } catch { /* ignore */ }
  };

  const statusConfig = PROJECT_STATUS_LABELS[project.status] || PROJECT_STATUS_LABELS.active;

  return (
    <div className="flex flex-col h-full">
      {/* プロジェクトヘッダー */}
      <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-slate-500" />
        </button>
        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
          <FolderOpen className="w-4 h-4 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900 truncate">{project.name}</h3>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusConfig.color}`}>
              {statusConfig.label}
            </span>
          </div>
          {project.description && (
            <p className="text-xs text-slate-500 truncate">{project.description}</p>
          )}
        </div>
        {activeSubTab === 'bizlog' && (
          <button
            onClick={() => { setShowNewEvent(true); setSelectedEvent(null); }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-3 h-3" />
            記録
          </button>
        )}
      </div>

      {/* サブタブ */}
      <div className="flex gap-1 pt-3 pb-2">
        {([
          { key: 'tasks' as const, label: 'タスク', icon: CheckSquare, count: tasks.length },
          { key: 'documents' as const, label: 'ドキュメント', icon: FileText, count: documents.length },
          { key: 'bizlog' as const, label: 'ビジネスログ', icon: ClipboardList, count: events.length },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSubTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              activeSubTab === tab.key
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-0.5 text-[10px] px-1 py-0.5 bg-slate-100 rounded-full">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* タブコンテンツ */}
      <div className="flex-1 overflow-y-auto">
        {/* タスクタブ */}
        {activeSubTab === 'tasks' && (
          <TaskList tasks={tasks} isLoading={isLoadingTasks} projectId={project.id} />
        )}

        {/* ドキュメントタブ */}
        {activeSubTab === 'documents' && (
          <DocumentList documents={documents} isLoading={isLoadingDocs} />
        )}

        {/* ビジネスログタブ */}
        {activeSubTab === 'bizlog' && (
          <div className="flex flex-1">
            <div className={`flex-1 ${selectedEvent ? 'border-r border-slate-200' : ''}`}>
              {/* チャネルメッセージタブ（ビジネスログ内） */}
              {projectChannels.length > 0 && (
                <BizlogSubTabs
                  channelMessages={channelMessages}
                  isLoadingMessages={isLoadingMessages}
                  projectChannels={projectChannels}
                />
              )}

              {showNewEvent && (
                <EventForm
                  contacts={contacts}
                  projectId={project.id}
                  onSubmit={handleCreateEvent}
                  onClose={() => setShowNewEvent(false)}
                />
              )}

              <EventTimeline
                events={events}
                isLoading={isLoadingEvents}
                selectedEventId={selectedEvent?.id || null}
                onSelectEvent={setSelectedEvent}
              />
            </div>

            {selectedEvent && (
              <div className="w-80 shrink-0">
                <EventDetail
                  event={selectedEvent}
                  project={project}
                  onClose={() => setSelectedEvent(null)}
                  onUpdate={handleUpdateEvent}
                  onDelete={handleDeleteEvent}
                  autoSuggest={autoSuggestEventId === selectedEvent.id}
                  onAutoSuggestDone={() => setAutoSuggestEventId(null)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ========================================
// タスク一覧（シンプル版）
// ========================================
function TaskList({ tasks, isLoading, projectId }: { tasks: Task[]; isLoading: boolean; projectId: string }) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-400">
        <div className="text-center">
          <div className="animate-spin text-2xl mb-2">&#8987;</div>
          <p className="text-sm">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-400">
        <div className="text-center">
          <CheckSquare className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <p className="text-xs">タスクがありません</p>
          <a
            href={`/tasks?project_id=${projectId}`}
            className="text-[10px] text-blue-600 hover:underline mt-1 inline-block"
          >
            タスクページで作成
          </a>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    todo: 'bg-slate-100 text-slate-600',
    in_progress: 'bg-blue-100 text-blue-700',
    done: 'bg-green-100 text-green-700',
  };

  const statusLabels: Record<string, string> = {
    todo: '未着手',
    in_progress: '進行中',
    done: '完了',
  };

  const priorityColors: Record<string, string> = {
    high: 'text-red-500',
    medium: 'text-amber-500',
    low: 'text-slate-400',
  };

  // ステータスでグルーピング
  const grouped = {
    in_progress: tasks.filter((t) => t.status === 'in_progress'),
    todo: tasks.filter((t) => t.status === 'todo'),
    done: tasks.filter((t) => t.status === 'done'),
  };

  return (
    <div className="py-2 space-y-4">
      {Object.entries(grouped).map(([status, statusTasks]) => {
        if (statusTasks.length === 0) return null;
        return (
          <div key={status}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColors[status] || ''}`}>
                {statusLabels[status] || status}
              </span>
              <span className="text-[10px] text-slate-400">{statusTasks.length}件</span>
            </div>
            <div className="space-y-1.5">
              {statusTasks.map((task) => (
                <a
                  key={task.id}
                  href={`/tasks?id=${task.id}`}
                  className="flex items-center gap-2.5 px-3 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <span className={`text-xs ${priorityColors[task.priority] || ''}`}>
                    {task.priority === 'high' ? '!' : task.priority === 'medium' ? '-' : '.'}
                  </span>
                  <span className="flex-1 text-sm text-slate-700 truncate">{task.title}</span>
                  {task.due_date && (
                    <span className="text-[10px] text-slate-400 shrink-0 flex items-center gap-0.5">
                      <Clock className="w-3 h-3" />
                      {new Date(task.due_date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </a>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ========================================
// ビジネスログ内サブタブ（イベント/メッセージ切替）
// ========================================
function BizlogSubTabs({
  channelMessages,
  isLoadingMessages,
  projectChannels,
}: {
  channelMessages: ChannelMessage[];
  isLoadingMessages: boolean;
  projectChannels: ProjectChannel[];
}) {
  const [subView, setSubView] = useState<'events' | 'messages'>('events');

  if (subView === 'messages') {
    return (
      <div>
        <div className="px-4 pt-2 flex gap-1 border-b border-slate-100">
          <button onClick={() => setSubView('events')} className="px-2 py-1 text-[10px] text-slate-500 hover:text-slate-700">
            イベント
          </button>
          <button className="px-2 py-1 text-[10px] text-blue-600 border-b border-blue-600 font-medium">
            メッセージ ({channelMessages.length})
          </button>
        </div>
        <ChannelMessagesList messages={channelMessages} isLoading={isLoadingMessages} />
      </div>
    );
  }

  return (
    <div className="px-4 pt-2 flex gap-1 border-b border-slate-100">
      <button className="px-2 py-1 text-[10px] text-blue-600 border-b border-blue-600 font-medium">
        イベント
      </button>
      {channelMessages.length > 0 && (
        <button onClick={() => setSubView('messages')} className="px-2 py-1 text-[10px] text-slate-500 hover:text-slate-700">
          メッセージ ({channelMessages.length})
        </button>
      )}
    </div>
  );
}

// ========================================
// メインコンポーネント
// ========================================
export default function ProjectsTab({ orgId, orgName }: ProjectsTabProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [unlinkedChannels, setUnlinkedChannels] = useState<UnlinkedChannel[]>([]);

  // プロジェクト取得
  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects?organization_id=${orgId}`);
      const data = await res.json();
      if (data.success) setProjects(data.data || []);
    } catch { /* ignore */ }
    finally { setIsLoading(false); }
  }, [orgId]);

  // 未紐づけチャネル取得
  const fetchUnlinkedChannels = useCallback(async () => {
    try {
      const res = await fetch(`/api/organizations/${orgId}/unlinked-channels`);
      const data = await res.json();
      if (data.success) setUnlinkedChannels(data.data || []);
    } catch { /* ignore */ }
  }, [orgId]);

  useEffect(() => {
    fetchProjects();
    fetchUnlinkedChannels();
  }, [fetchProjects, fetchUnlinkedChannels]);

  // プロジェクト作成
  const handleCreateProject = async (name: string, description: string) => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: description || null, organizationId: orgId }),
      });
      const data = await res.json();
      if (data.success) fetchProjects();
    } catch { /* ignore */ }
  };

  // チャネル紐づけ
  const handleLinkChannel = async (channel: UnlinkedChannel, projectId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceName: channel.service_name,
          channelIdentifier: channel.channel_identifier,
          channelLabel: channel.channel_name,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setUnlinkedChannels((prev) =>
          prev.filter((c) =>
            !(c.service_name === channel.service_name && c.channel_identifier === channel.channel_identifier)
          )
        );
      }
    } catch { /* ignore */ }
  };

  if (selectedProject) {
    return (
      <ProjectDetailPanel
        project={selectedProject}
        orgId={orgId}
        onBack={() => setSelectedProject(null)}
      />
    );
  }

  return (
    <ProjectList
      projects={projects}
      isLoading={isLoading}
      onSelectProject={setSelectedProject}
      onCreateProject={handleCreateProject}
      unlinkedChannels={unlinkedChannels}
      onLinkChannel={handleLinkChannel}
    />
  );
}
