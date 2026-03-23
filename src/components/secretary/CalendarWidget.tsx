// v9.0: カレンダーウィジェット + NodeAI参加ボタン
// 月/週ビュー + 予定表示 + 新規作成 + 編集 + NodeAI Bot起動
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Plus, X, Loader2, Clock, AlertCircle, Bot, Square, FolderOpen } from 'lucide-react';

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  htmlLink?: string;
  attendees?: { email: string; responseStatus?: string }[];
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: { uri?: string; entryPointType?: string }[];
  };
}

type ViewMode = 'month' | 'week';

// Google Meet URL をイベントから抽出
function getMeetUrl(ev: CalendarEvent): string | null {
  if (ev.hangoutLink) return ev.hangoutLink;
  if (ev.conferenceData?.entryPoints) {
    const videoEntry = ev.conferenceData.entryPoints.find(
      (e) => e.entryPointType === 'video' && e.uri?.includes('meet.google.com')
    );
    if (videoEntry?.uri) return videoEntry.uri;
  }
  return null;
}

// descriptionからproject_idを抽出（定期イベント作成時に埋め込み済み）
function extractProjectId(description?: string): string | null {
  if (!description) return null;
  const match = description.match(/project_id:\s*([0-9a-f-]{36})/i);
  return match ? match[1] : null;
}

interface ProjectOption {
  id: string;
  name: string;
  org_name: string;
}

export default function CalendarWidget() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notConnected, setNotConnected] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ summary: '', date: '', startTime: '10:00', endTime: '11:00', withMeet: false });
  // NodeAI状態: botId → セッション中
  const [nodeAiBots, setNodeAiBots] = useState<Record<string, string>>({}); // eventId → botId
  const [joiningEventId, setJoiningEventId] = useState<string | null>(null);
  // PJ選択UI
  const [projectSelectEventId, setProjectSelectEventId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const projectSelectRef = useRef<HTMLDivElement>(null);

  // プロジェクト一覧取得
  const fetchProjects = useCallback(async () => {
    if (projectsLoaded) return;
    try {
      const res = await fetch('/api/projects/list-all');
      const data = await res.json();
      if (data.success && data.data) {
        setProjects(data.data);
        setProjectsLoaded(true);
      }
    } catch { /* ignore */ }
  }, [projectsLoaded]);

  // PJ選択UIの外側クリックで閉じる
  useEffect(() => {
    if (!projectSelectEventId) return;
    const handleClick = (e: MouseEvent) => {
      if (projectSelectRef.current && !projectSelectRef.current.contains(e.target as Node)) {
        setProjectSelectEventId(null);
        setSelectedProjectId('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [projectSelectEventId]);

  // NodeAI Bot を会議に参加させる（project_id付き）
  const executeNodeAiJoin = async (ev: CalendarEvent, projectId?: string) => {
    const meetUrl = getMeetUrl(ev);
    if (!meetUrl) return;

    setJoiningEventId(ev.id);
    setProjectSelectEventId(null);
    setSelectedProjectId('');
    try {
      const res = await fetch('/api/nodeai/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meeting_url: meetUrl,
          project_id: projectId || undefined,
        }),
      });
      const data = await res.json();
      if (data.success && data.data?.bot_id) {
        setNodeAiBots((prev) => ({ ...prev, [ev.id]: data.data.bot_id }));
      } else {
        console.error('[NodeAI] Join failed:', data.error);
        alert(data.error || 'NodeAIの参加に失敗しました');
      }
    } catch (err) {
      console.error('[NodeAI] Join error:', err);
      alert('NodeAIの参加に失敗しました');
    } finally {
      setJoiningEventId(null);
    }
  };

  // AI参加ボタン押下 → project_idチェック → あればそのまま参加、なければPJ選択表示
  const handleNodeAiJoin = async (ev: CalendarEvent) => {
    const meetUrl = getMeetUrl(ev);
    if (!meetUrl) return;

    const projectId = extractProjectId(ev.description);
    if (projectId) {
      // 定期イベント等でproject_idが埋め込まれている場合はそのまま参加
      await executeNodeAiJoin(ev, projectId);
    } else {
      // project_idがない場合はプロジェクト選択UIを表示
      setProjectSelectEventId(ev.id);
      fetchProjects();
    }
  };

  // NodeAI Bot を退出させる
  const handleNodeAiLeave = async (eventId: string) => {
    const botId = nodeAiBots[eventId];
    if (!botId) return;

    try {
      await fetch('/api/nodeai/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_id: botId }),
      });
      setNodeAiBots((prev) => {
        const next = { ...prev };
        delete next[eventId];
        return next;
      });
    } catch (err) {
      console.error('[NodeAI] Leave error:', err);
    }
  };

  // 月のイベント取得
  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const timeMin = new Date(year, month, 1).toISOString();
      const timeMax = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

      const res = await fetch(`/api/calendar?mode=range&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`);
      const data = await res.json();

      if (data.notConnected) {
        setNotConnected(true);
        return;
      }

      if (data.success && data.data?.events) {
        setEvents(data.data.events);
      }
    } catch { /* ignore */ }
    finally { setIsLoading(false); }
  }, [currentDate]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // 月ナビゲーション
  const goToPrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };
  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };
  const goToToday = () => {
    const today = new Date();
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(today);
  };

  // カレンダーグリッド生成
  const calendarGrid = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0=日
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const cells: { date: Date; isCurrentMonth: boolean }[] = [];

    // 前月
    for (let i = firstDay - 1; i >= 0; i--) {
      cells.push({ date: new Date(year, month - 1, prevMonthDays - i), isCurrentMonth: false });
    }
    // 当月
    for (let i = 1; i <= daysInMonth; i++) {
      cells.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }
    // 次月（6行=42セルに揃える）
    const remaining = 42 - cells.length;
    for (let i = 1; i <= remaining; i++) {
      cells.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }

    return cells;
  }, [currentDate]);

  // 日付キー
  const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // 日付ごとのイベントマップ
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of events) {
      const d = new Date(ev.start);
      const key = dateKey(d);
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    }
    return map;
  }, [events]);

  // 選択日のイベント
  const selectedDateEvents = useMemo(() => {
    return eventsByDate[dateKey(selectedDate)] || [];
  }, [eventsByDate, selectedDate]);

  // 今日判定
  const today = new Date();
  const todayKey = dateKey(today);

  // 時刻フォーマット
  const formatTime = (isoStr: string) => {
    const d = new Date(isoStr);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // 終了時刻バリデーション
  const isEndTimeValid = createForm.startTime && createForm.endTime && createForm.startTime < createForm.endTime;

  // 予定作成
  const handleCreate = async () => {
    if (!createForm.summary || !createForm.date) return;
    if (!isEndTimeValid) {
      alert('終了時刻は開始時刻より後に設定してください');
      return;
    }
    setIsCreating(true);
    try {
      const start = `${createForm.date}T${createForm.startTime}:00+09:00`;
      const end = `${createForm.date}T${createForm.endTime}:00+09:00`;

      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: createForm.summary, start, end, withMeet: createForm.withMeet }),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateForm(false);
        setCreateForm({ summary: '', date: '', startTime: '10:00', endTime: '11:00', withMeet: false });
        fetchEvents();
      } else {
        alert(data.error || '予定の作成に失敗しました');
      }
    } catch { /* ignore */ }
    finally { setIsCreating(false); }
  };

  // 未接続
  if (notConnected) {
    return (
      <div className="bg-nm-surface rounded-xl border border-nm-border shadow-sm flex flex-col" style={{ minHeight: '400px' }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-nm-border">
          <Calendar className="w-4 h-4 text-nm-primary" />
          <span className="text-sm font-medium text-nm-text">カレンダー</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-nm-text-muted p-6">
          <AlertCircle className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-xs text-center">Google Calendar が未連携です</p>
          <a href="/settings" className="text-xs text-nm-primary hover:underline mt-2">設定画面から連携</a>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-nm-surface rounded-xl border border-nm-border shadow-sm flex flex-col" style={{ minHeight: '400px' }}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-nm-border">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-nm-primary" />
          <span className="text-sm font-medium text-nm-text">カレンダー</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={goToToday}
            className="text-[10px] text-nm-primary hover:text-nm-primary-hover px-1.5 py-0.5 rounded transition-colors"
          >
            今日
          </button>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="p-1 text-nm-primary hover:bg-nm-primary-light rounded transition-colors"
          >
            {showCreateForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* 月ナビ */}
      <div className="flex items-center justify-between px-4 py-2">
        <button onClick={goToPrevMonth} className="p-1 hover:bg-slate-100 rounded transition-colors">
          <ChevronLeft className="w-4 h-4 text-nm-text-secondary" />
        </button>
        <span className="text-xs font-medium text-nm-text">
          {currentDate.getFullYear()}年{currentDate.getMonth() + 1}月
        </span>
        <button onClick={goToNextMonth} className="p-1 hover:bg-slate-100 rounded transition-colors">
          <ChevronRight className="w-4 h-4 text-nm-text-secondary" />
        </button>
      </div>

      {/* 予定作成フォーム */}
      {showCreateForm && (
        <div className="px-4 pb-3 space-y-2 border-b border-nm-border">
          <input
            type="text"
            placeholder="予定のタイトル"
            value={createForm.summary}
            onChange={(e) => setCreateForm({ ...createForm, summary: e.target.value })}
            className="w-full text-xs border border-nm-border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-nm-primary"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={createForm.date}
              onChange={(e) => setCreateForm({ ...createForm, date: e.target.value })}
              className="flex-1 text-xs border border-nm-border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-nm-primary"
            />
          </div>
          <div className="flex gap-2 items-center">
            <input
              type="time"
              value={createForm.startTime}
              onChange={(e) => setCreateForm({ ...createForm, startTime: e.target.value })}
              className="flex-1 text-xs border border-nm-border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-nm-primary"
            />
            <span className="text-[10px] text-nm-text-muted">〜</span>
            <input
              type="time"
              value={createForm.endTime}
              onChange={(e) => setCreateForm({ ...createForm, endTime: e.target.value })}
              className="flex-1 text-xs border border-nm-border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-nm-primary"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={createForm.withMeet}
              onChange={(e) => setCreateForm({ ...createForm, withMeet: e.target.checked })}
              className="w-3.5 h-3.5 rounded border-nm-border text-nm-primary focus:ring-nm-primary"
            />
            <div className="flex items-center gap-1">
              <Bot className="w-3 h-3 text-nm-text-secondary" />
              <span className="text-[11px] text-nm-text-secondary">Google Meet付き（AI参加可能）</span>
            </div>
          </label>
          {!isEndTimeValid && createForm.startTime && createForm.endTime && (
            <p className="text-[10px] text-red-500">終了時刻は開始時刻より後に設定してください</p>
          )}
          <button
            onClick={handleCreate}
            disabled={isCreating || !createForm.summary || !createForm.date || !isEndTimeValid}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-nm-primary text-white rounded text-xs font-medium hover:bg-nm-primary-hover disabled:opacity-50 transition-colors"
          >
            {isCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            予定を作成
          </button>
        </div>
      )}

      {/* カレンダーグリッド */}
      <div className="px-3 pb-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-nm-text-muted animate-spin" />
          </div>
        ) : (
          <>
            {/* 曜日ヘッダー */}
            <div className="grid grid-cols-7 mb-1">
              {['日', '月', '火', '水', '木', '金', '土'].map((day, i) => (
                <div key={day} className={`text-center text-[10px] font-medium py-1 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-nm-text-muted'}`}>
                  {day}
                </div>
              ))}
            </div>

            {/* 日付グリッド */}
            <div className="grid grid-cols-7 gap-0.5">
              {calendarGrid.map((cell, i) => {
                const key = dateKey(cell.date);
                const isToday = key === todayKey;
                const isSelected = key === dateKey(selectedDate);
                const dayEvents = eventsByDate[key] || [];
                const dow = cell.date.getDay();

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(cell.date)}
                    className={`
                      relative aspect-square flex flex-col items-center justify-center rounded-lg text-[11px] transition-colors
                      ${!cell.isCurrentMonth ? 'text-nm-text-muted/40' : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-nm-text'}
                      ${isToday ? 'bg-nm-primary text-white font-bold' : ''}
                      ${isSelected && !isToday ? 'bg-nm-primary-light border border-nm-primary-border' : ''}
                      ${!isToday && !isSelected ? 'hover:bg-slate-50' : ''}
                    `}
                  >
                    {cell.date.getDate()}
                    {dayEvents.length > 0 && (
                      <div className={`absolute bottom-0.5 flex gap-0.5`}>
                        {dayEvents.slice(0, 3).map((_, di) => (
                          <div key={di} className={`w-1 h-1 rounded-full ${isToday ? 'bg-white' : 'bg-nm-primary'}`} />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* 選択日の予定 */}
      <div className="flex-1 border-t border-nm-border overflow-y-auto">
        <div className="px-4 py-2">
          <p className="text-[10px] font-medium text-nm-text-secondary mb-1">
            {selectedDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}の予定
            {selectedDateEvents.length > 0 && ` (${selectedDateEvents.length}件)`}
          </p>
          {selectedDateEvents.length === 0 ? (
            <p className="text-[10px] text-nm-text-muted py-2">予定はありません</p>
          ) : (
            <div className="space-y-1.5">
              {selectedDateEvents
                .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
                .map((ev) => {
                  const meetUrl = getMeetUrl(ev);
                  const isJoined = !!nodeAiBots[ev.id];
                  const isJoining = joiningEventId === ev.id;
                  return (
                    <div key={ev.id} className="flex items-start gap-2 py-1.5">
                      <Clock className="w-3 h-3 text-nm-text-muted mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-medium text-nm-text truncate">{ev.summary}</p>
                        <p className="text-[10px] text-nm-text-muted">
                          {formatTime(ev.start)} - {formatTime(ev.end)}
                        </p>
                      </div>
                      {meetUrl && (
                        isJoined ? (
                          <button
                            onClick={() => handleNodeAiLeave(ev.id)}
                            className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-medium text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors"
                            title="NodeAIを退出させる"
                          >
                            <Square className="w-2.5 h-2.5" />
                            <span>停止</span>
                          </button>
                        ) : projectSelectEventId === ev.id ? (
                          <div ref={projectSelectRef} className="shrink-0 flex flex-col gap-1 bg-white border border-blue-200 rounded-lg p-2 shadow-lg min-w-[180px]">
                            <div className="flex items-center gap-1 mb-1">
                              <FolderOpen className="w-3 h-3 text-nm-text-secondary" />
                              <span className="text-[9px] font-medium text-nm-text-secondary">プロジェクト選択</span>
                            </div>
                            <select
                              value={selectedProjectId}
                              onChange={(e) => setSelectedProjectId(e.target.value)}
                              className="text-[10px] border border-nm-border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-nm-primary w-full"
                            >
                              <option value="">-- 選択してください --</option>
                              {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.org_name ? `${p.org_name} / ` : ''}{p.name}
                                </option>
                              ))}
                            </select>
                            <div className="flex gap-1 mt-1">
                              <button
                                onClick={() => {
                                  if (selectedProjectId) {
                                    executeNodeAiJoin(ev, selectedProjectId);
                                  }
                                }}
                                disabled={!selectedProjectId}
                                className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1 text-[9px] font-medium text-white bg-nm-primary rounded hover:bg-nm-primary-hover disabled:opacity-40 transition-colors"
                              >
                                <Bot className="w-2.5 h-2.5" />
                                参加
                              </button>
                              <button
                                onClick={() => executeNodeAiJoin(ev)}
                                className="flex-1 px-1.5 py-1 text-[9px] text-nm-text-secondary bg-slate-50 border border-nm-border rounded hover:bg-slate-100 transition-colors"
                              >
                                PJなしで参加
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleNodeAiJoin(ev)}
                            disabled={isJoining}
                            className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors disabled:opacity-50"
                            title="NodeAIを会議に参加させる"
                          >
                            {isJoining ? (
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            ) : (
                              <Bot className="w-2.5 h-2.5" />
                            )}
                            <span>{isJoining ? '参加中...' : 'AI参加'}</span>
                          </button>
                        )
                      )}
                      {!meetUrl && (
                        <span className="shrink-0 text-[8px] text-nm-text-muted/60 italic">Meet無し</span>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
