// Phase 30d: ビジネスログ — タイムラインUI
'use client';

import { useState, useEffect, useCallback } from 'react';
import { FolderOpen, Plus, Clock, FileText, Phone, Mail, MessageSquare, Handshake, X, ChevronRight, ClipboardList } from 'lucide-react';
import Header from '@/components/shared/Header';

// ========================================
// 型定義
// ========================================
interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
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

// ========================================
// 定数
// ========================================
const EVENT_TYPE_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  note: { label: 'メモ', icon: FileText, color: 'bg-slate-100 text-slate-600' },
  meeting: { label: '打ち合わせ', icon: Handshake, color: 'bg-blue-100 text-blue-700' },
  call: { label: '電話', icon: Phone, color: 'bg-green-100 text-green-700' },
  email: { label: 'メール', icon: Mail, color: 'bg-orange-100 text-orange-700' },
  chat: { label: 'チャット', icon: MessageSquare, color: 'bg-purple-100 text-purple-700' },
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

  // 新規作成フォーム
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventContent, setNewEventContent] = useState('');
  const [newEventType, setNewEventType] = useState('note');

  // メッセージ
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ========================================
  // データ取得
  // ========================================
  const fetchProjects = useCallback(async () => {
    setIsLoadingProjects(true);
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      if (data.success) {
        setProjects(data.data || []);
      }
    } catch {
      // エラーは無視
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    setIsLoadingEvents(true);
    try {
      const params = new URLSearchParams();
      if (selectedProjectId) params.set('project_id', selectedProjectId);
      const res = await fetch(`/api/business-events?${params}`);
      const data = await res.json();
      if (data.success) {
        setEvents(data.data || []);
      }
    } catch {
      // エラーは無視
    } finally {
      setIsLoadingEvents(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // ========================================
  // プロジェクト作成
  // ========================================
  const createProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName.trim(), description: newProjectDesc.trim() || null }),
      });
      const data = await res.json();
      if (data.success) {
        setShowNewProject(false);
        setNewProjectName('');
        setNewProjectDesc('');
        fetchProjects();
        setMessage({ type: 'success', text: 'プロジェクトを作成しました' });
      } else {
        setMessage({ type: 'error', text: data.error || '作成に失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: '通信エラー' });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  // ========================================
  // イベント作成
  // ========================================
  const createEvent = async () => {
    if (!newEventTitle.trim()) return;
    try {
      const res = await fetch('/api/business-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newEventTitle.trim(),
          content: newEventContent.trim() || null,
          eventType: newEventType,
          projectId: selectedProjectId || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowNewEvent(false);
        setNewEventTitle('');
        setNewEventContent('');
        setNewEventType('note');
        fetchEvents();
        setMessage({ type: 'success', text: 'イベントを記録しました' });
      } else {
        setMessage({ type: 'error', text: data.error || '作成に失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: '通信エラー' });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const eventsByDate = groupEventsByDate(events);
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div className="flex flex-col h-screen bg-white">
      <Header />
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* ページヘッダー（contactsページと同じパターン） */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-slate-600" />
              <h1 className="text-lg font-bold text-slate-900">
                {selectedProject ? selectedProject.name : 'ビジネスログ'}
              </h1>
            </div>
            <button
              onClick={() => { setShowNewEvent(true); setSelectedEvent(null); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              イベント記録
            </button>
          </div>
          {selectedProject?.description && (
            <p className="text-xs text-slate-500">{selectedProject.description}</p>
          )}
        </div>

        {/* メッセージバナー（コンテンツ領域内に配置） */}
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
                <button
                  onClick={() => setShowNewProject(!showNewProject)}
                  className="p-1 text-slate-400 hover:text-blue-600 transition-colors"
                  title="プロジェクト追加"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 新規プロジェクトフォーム */}
            {showNewProject && (
              <div className="px-3 py-3 border-b border-slate-200 bg-white">
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
                <div className="flex gap-1.5">
                  <button
                    onClick={createProject}
                    className="flex-1 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    作成
                  </button>
                  <button
                    onClick={() => { setShowNewProject(false); setNewProjectName(''); setNewProjectDesc(''); }}
                    className="px-2.5 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {/* プロジェクト一覧 */}
            <div className="flex-1 overflow-y-auto">
              <button
                onClick={() => setSelectedProjectId(null)}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors ${
                  !selectedProjectId ? 'bg-white text-slate-900 font-medium shadow-sm' : 'text-slate-600 hover:bg-white'
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
                      <span className="truncate flex-1">{project.name}</span>
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
            {/* 新規イベントフォーム */}
            {showNewEvent && (
              <div className="mx-6 mt-4 p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700">新しいイベントを記録</h3>
                  <button onClick={() => setShowNewEvent(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-3">
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
                  <input
                    type="text"
                    value={newEventTitle}
                    onChange={(e) => setNewEventTitle(e.target.value)}
                    placeholder="タイトル"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <textarea
                    value={newEventContent}
                    onChange={(e) => setNewEventContent(e.target.value)}
                    placeholder="詳細（任意）"
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowNewEvent(false)}
                      className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={createEvent}
                      disabled={!newEventTitle.trim()}
                      className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      記録する
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* タイムライン本体 */}
            <div className="px-6 py-4">
              {isLoadingEvents ? (
                <div className="flex items-center justify-center h-48 text-slate-400">
                  <div className="text-center">
                    <div className="animate-spin text-2xl mb-2">&#8987;</div>
                    <p className="text-sm">読み込み中...</p>
                  </div>
                </div>
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
                          <button
                            key={event.id}
                            onClick={() => setSelectedEvent(isSelected ? null : event)}
                            className={`w-full flex items-start gap-3 p-3 rounded-lg text-left transition-colors ${
                              isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'
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
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ========================================
              右パネル: イベント詳細（contactsの詳細パネルと同構造）
              ======================================== */}
          {selectedEvent && (
            <div className="w-80 overflow-y-auto bg-slate-50 shrink-0 p-5">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-base font-bold text-slate-900 pr-2">{selectedEvent.title}</h3>
                <button onClick={() => setSelectedEvent(null)} className="text-slate-400 hover:text-slate-600 shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* タイプバッジ */}
              {(() => {
                const typeConfig = EVENT_TYPE_CONFIG[selectedEvent.event_type] || EVENT_TYPE_CONFIG.note;
                const Icon = typeConfig.icon;
                return (
                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium mb-4 ${typeConfig.color}`}>
                    <Icon className="w-3 h-3" />
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
        </div>
      </div>
    </div>
  );
}
