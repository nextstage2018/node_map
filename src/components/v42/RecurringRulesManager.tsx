'use client';

// v4.2 → v8.0: 定期イベント管理コンポーネント
// プロジェクト詳細の定期イベントタブに配置
// 種別: MTG / 定期作業
// 頻度: 毎日 / 毎週 / 毎月（直感的UI）
// 参加者: ログインユーザー + 社内メンバー選択
// 議事録読み取り: MTGのみ（会議後巡回設定）

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, Plus, Trash2, Edit2, X, Check,
  ToggleLeft, ToggleRight, Users, FileText, Calendar,
  Video, Briefcase,
} from 'lucide-react';

interface RecurringRule {
  id: string;
  project_id: string;
  type: 'meeting' | 'task' | 'job';
  title: string;
  rrule: string;
  lead_days: number;
  calendar_sync: boolean;
  auto_create: boolean;
  metadata: Record<string, unknown>;
  enabled: boolean;
  occurrence_count: number;
  last_generated_at: string | null;
  created_at: string;
}

interface ProjectMember {
  contact_id: string;
  name: string;
  email: string | null;
}

interface Props {
  projectId: string;
}

// RRULE を人間向けに変換
function rruleToJapanese(rrule: string): string {
  const parts = rrule.replace(/^RRULE:/i, '').split(';');
  const map: Record<string, string> = {};
  for (const part of parts) {
    const [k, v] = part.split('=');
    map[k.toUpperCase()] = v;
  }

  const dayLabels: Record<string, string> = {
    MO: '月', TU: '火', WE: '水', TH: '木', FR: '金', SA: '土', SU: '日',
  };

  const freq = map.FREQ;
  const interval = parseInt(map.INTERVAL || '1', 10);
  const byday = map.BYDAY;

  let text = '';
  switch (freq) {
    case 'DAILY':
      text = interval === 1 ? '毎日' : `${interval}日ごと`;
      break;
    case 'WEEKLY':
      if (byday) {
        const days = byday.split(',').map(d => dayLabels[d.trim()] || d).join('・');
        text = interval === 1 ? `毎週 ${days}` : `${interval}週ごと ${days}`;
      } else {
        text = interval === 1 ? '毎週' : `${interval}週ごと`;
      }
      break;
    case 'MONTHLY': {
      const md = map.BYMONTHDAY;
      text = md ? `毎月${md}日` : (interval === 1 ? '毎月' : `${interval}ヶ月ごと`);
      break;
    }
    default:
      text = rrule;
  }
  return text;
}

type EventType = 'meeting' | 'job'; // MTG or 定期作業
type FreqType = 'daily' | 'weekly' | 'monthly';

const DAYS_OF_WEEK = [
  { key: 'MO', label: '月' },
  { key: 'TU', label: '火' },
  { key: 'WE', label: '水' },
  { key: 'TH', label: '木' },
  { key: 'FR', label: '金' },
  { key: 'SA', label: '土' },
  { key: 'SU', label: '日' },
];

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7:00 ~ 20:00
const MINUTES = [0, 15, 30, 45];

export default function RecurringRulesManager({ projectId }: Props) {
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);

  // フォーム状態
  const [formType, setFormType] = useState<EventType>('meeting');
  const [formTitle, setFormTitle] = useState('');
  const [formFreq, setFormFreq] = useState<FreqType>('weekly');
  const [formSelectedDays, setFormSelectedDays] = useState<string[]>(['MO']);
  const [formMonthDay, setFormMonthDay] = useState(1);
  const [formStartHour, setFormStartHour] = useState(10);
  const [formStartMinute, setFormStartMinute] = useState(0);
  const [formDurationMin, setFormDurationMin] = useState(60);
  const [formParticipants, setFormParticipants] = useState<string[]>([]); // contact_ids
  const [formMeetingNotes, setFormMeetingNotes] = useState(true); // 議事録読み取り
  const [formCalendarSync, setFormCalendarSync] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchRules = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/recurring-rules`);
      const data = await res.json();
      if (data.success) setRules(data.data || []);
    } catch { /* */ }
    setIsLoading(false);
  }, [projectId]);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/members`);
      const data = await res.json();
      if (data.success) {
        setMembers((data.data || []).map((m: Record<string, unknown>) => ({
          contact_id: m.contact_id,
          name: (m.contact_persons as Record<string, unknown>)?.name || m.contact_id,
          email: null,
        })));
      }
    } catch { /* */ }
  }, [projectId]);

  useEffect(() => { fetchRules(); }, [fetchRules]);
  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  // RRULE生成
  const buildRrule = (): string => {
    switch (formFreq) {
      case 'daily':
        return 'FREQ=DAILY';
      case 'weekly':
        if (formSelectedDays.length === 0) return 'FREQ=WEEKLY;BYDAY=MO';
        return `FREQ=WEEKLY;BYDAY=${formSelectedDays.join(',')}`;
      case 'monthly':
        return `FREQ=MONTHLY;BYMONTHDAY=${formMonthDay}`;
      default:
        return 'FREQ=WEEKLY;BYDAY=MO';
    }
  };

  // RRULEからフォーム状態を復元
  const parseRruleToForm = (rrule: string) => {
    const parts = rrule.replace(/^RRULE:/i, '').split(';');
    const map: Record<string, string> = {};
    for (const part of parts) {
      const [k, v] = part.split('=');
      map[k.toUpperCase()] = v;
    }

    if (map.FREQ === 'DAILY') {
      setFormFreq('daily');
    } else if (map.FREQ === 'MONTHLY') {
      setFormFreq('monthly');
      setFormMonthDay(parseInt(map.BYMONTHDAY || '1', 10));
    } else {
      setFormFreq('weekly');
      setFormSelectedDays(map.BYDAY ? map.BYDAY.split(',') : ['MO']);
    }
  };

  const resetForm = () => {
    setFormType('meeting');
    setFormTitle('');
    setFormFreq('weekly');
    setFormSelectedDays(['MO']);
    setFormMonthDay(1);
    setFormStartHour(10);
    setFormStartMinute(0);
    setFormDurationMin(60);
    setFormParticipants([]);
    setFormMeetingNotes(true);
    setFormCalendarSync(true);
    setEditingId(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!formTitle.trim()) return;
    setIsSaving(true);

    const metadata: Record<string, unknown> = {
      start_hour: formStartHour,
      start_minute: formStartMinute,
      duration_minutes: formDurationMin,
      participants: formParticipants,
    };
    if (formType === 'meeting') {
      metadata.meeting_notes_enabled = formMeetingNotes;
    }

    // MTGはカレンダー必須
    const calendarSync = formType === 'meeting' ? true : formCalendarSync;

    try {
      if (editingId) {
        await fetch(`/api/projects/${projectId}/recurring-rules/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formTitle,
            rrule: buildRrule(),
            lead_days: 7,
            calendar_sync: calendarSync,
            auto_create: true,
            metadata,
          }),
        });
      } else {
        await fetch(`/api/projects/${projectId}/recurring-rules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: formType === 'meeting' ? 'meeting' : 'job',
            title: formTitle,
            rrule: buildRrule(),
            lead_days: 7,
            calendar_sync: calendarSync,
            auto_create: true,
            metadata,
          }),
        });
      }
      resetForm();
      fetchRules();
    } catch { /* */ }
    setIsSaving(false);
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm('この定期イベントを削除しますか？')) return;
    try {
      await fetch(`/api/projects/${projectId}/recurring-rules/${ruleId}`, { method: 'DELETE' });
      fetchRules();
    } catch { /* */ }
  };

  const handleToggleEnabled = async (rule: RecurringRule) => {
    try {
      await fetch(`/api/projects/${projectId}/recurring-rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      fetchRules();
    } catch { /* */ }
  };

  const startEdit = (rule: RecurringRule) => {
    setEditingId(rule.id);
    setFormType(rule.type === 'meeting' ? 'meeting' : 'job');
    setFormTitle(rule.title);
    parseRruleToForm(rule.rrule);
    const meta = rule.metadata as Record<string, unknown>;
    setFormStartHour((meta?.start_hour as number) || 10);
    setFormStartMinute((meta?.start_minute as number) || 0);
    setFormDurationMin((meta?.duration_minutes as number) || 60);
    setFormParticipants((meta?.participants as string[]) || []);
    setFormMeetingNotes((meta?.meeting_notes_enabled as boolean) ?? true);
    setFormCalendarSync(rule.calendar_sync);
    setShowForm(true);
  };

  const toggleDay = (day: string) => {
    setFormSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const toggleParticipant = (contactId: string) => {
    setFormParticipants(prev =>
      prev.includes(contactId) ? prev.filter(id => id !== contactId) : [...prev, contactId]
    );
  };

  return (
    <div className="mt-6 border-t border-slate-200 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          定期イベント
        </h3>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        >
          <Plus className="w-3 h-3" />
          追加
        </button>
      </div>

      {/* ===== 作成/編集フォーム ===== */}
      {showForm && (
        <div className="mb-4 p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <h4 className="text-xs font-bold text-slate-700 mb-3">
            {editingId ? '定期イベントを編集' : '定期イベントを作成'}
          </h4>

          {/* Step 1: 種別 */}
          <div className="mb-4">
            <label className="block text-[10px] font-medium text-slate-500 mb-1.5">種別</label>
            <div className="flex gap-2">
              <button
                onClick={() => { setFormType('meeting'); setFormCalendarSync(true); }}
                disabled={!!editingId}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                  formType === 'meeting'
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                } ${editingId ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <Video className="w-4 h-4" />
                MTG
              </button>
              <button
                onClick={() => setFormType('job')}
                disabled={!!editingId}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                  formType === 'job'
                    ? 'bg-amber-50 border-amber-300 text-amber-700'
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                } ${editingId ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <Briefcase className="w-4 h-4" />
                定期作業
              </button>
            </div>
          </div>

          {/* Step 2: タイトル */}
          <div className="mb-4">
            <label className="block text-[10px] font-medium text-slate-500 mb-1">タイトル</label>
            <input
              type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)}
              placeholder={formType === 'meeting' ? '例: 週次定例MTG' : '例: 月次レポート作成'}
              autoFocus
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Step 3: 頻度 */}
          <div className="mb-4">
            <label className="block text-[10px] font-medium text-slate-500 mb-1.5">頻度</label>
            <div className="flex gap-1.5 mb-2">
              {([
                { value: 'daily' as const, label: '毎日' },
                { value: 'weekly' as const, label: '毎週' },
                { value: 'monthly' as const, label: '毎月' },
              ]).map(f => (
                <button
                  key={f.value}
                  onClick={() => setFormFreq(f.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    formFreq === f.value
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* 毎週: 曜日選択 */}
            {formFreq === 'weekly' && (
              <div className="flex gap-1 mt-2">
                {DAYS_OF_WEEK.map(d => (
                  <button
                    key={d.key}
                    onClick={() => toggleDay(d.key)}
                    className={`w-9 h-9 rounded-full text-xs font-medium transition-colors ${
                      formSelectedDays.includes(d.key)
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}

            {/* 毎月: 日付選択 */}
            {formFreq === 'monthly' && (
              <div className="mt-2">
                <label className="text-[10px] text-slate-500 mr-2">毎月</label>
                <select
                  value={formMonthDay}
                  onChange={(e) => setFormMonthDay(parseInt(e.target.value, 10))}
                  className="px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>{d}日</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Step 4: 時間 */}
          <div className="mb-4">
            <label className="block text-[10px] font-medium text-slate-500 mb-1">時間</label>
            <div className="flex items-center gap-2">
              <select
                value={formStartHour}
                onChange={(e) => setFormStartHour(parseInt(e.target.value, 10))}
                className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {HOURS.map(h => (
                  <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
                ))}
              </select>
              <span className="text-xs text-slate-400">:</span>
              <select
                value={formStartMinute}
                onChange={(e) => setFormStartMinute(parseInt(e.target.value, 10))}
                className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {MINUTES.map(m => (
                  <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                ))}
              </select>
              <span className="text-xs text-slate-400 mx-1">〜</span>
              <select
                value={formDurationMin}
                onChange={(e) => setFormDurationMin(parseInt(e.target.value, 10))}
                className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {[15, 30, 45, 60, 90, 120, 180].map(m => (
                  <option key={m} value={m}>{m}分</option>
                ))}
              </select>
            </div>
          </div>

          {/* Step 5: 参加者 */}
          <div className="mb-4">
            <label className="block text-[10px] font-medium text-slate-500 mb-1.5">
              <Users className="w-3 h-3 inline mr-0.5" />
              参加者
            </label>
            <p className="text-[10px] text-slate-400 mb-1.5">自分は自動で含まれます。追加メンバーを選択:</p>
            {members.length === 0 ? (
              <p className="text-[10px] text-slate-400 italic">プロジェクトメンバーがいません（メンバータブで追加）</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {members.map(m => (
                  <button
                    key={m.contact_id}
                    onClick={() => toggleParticipant(m.contact_id)}
                    className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors ${
                      formParticipants.includes(m.contact_id)
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Step 6: MTG専用 — 議事録読み取り */}
          {formType === 'meeting' && (
            <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formMeetingNotes}
                  onChange={(e) => setFormMeetingNotes(e.target.checked)}
                  className="rounded"
                />
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span className="font-medium">議事録の自動読み取り</span>
              </label>
              <p className="text-[10px] text-slate-400 mt-1 ml-6">
                会議終了1時間後にGemini会議メモを巡回取得。未検出なら30分後に再試行。取得できたら次回まで停止。
              </p>
            </div>
          )}

          {/* Step 7: 定期作業のみ — カレンダー同期オプション */}
          {formType === 'job' && (
            <div className="mb-4">
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formCalendarSync}
                  onChange={(e) => setFormCalendarSync(e.target.checked)}
                  className="rounded"
                />
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>Googleカレンダーに登録</span>
              </label>
            </div>
          )}

          {/* MTGはカレンダー必須表示 */}
          {formType === 'meeting' && (
            <div className="mb-4 flex items-center gap-1.5 text-[10px] text-blue-500">
              <Calendar className="w-3 h-3" />
              MTGはGoogleカレンダーに自動登録されます
            </div>
          )}

          {/* ボタン */}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button onClick={resetForm} className="px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !formTitle.trim()}
              className="px-4 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isSaving ? '保存中...' : editingId ? '更新' : '作成'}
            </button>
          </div>
        </div>
      )}

      {/* ===== ルール一覧 ===== */}
      {isLoading ? (
        <p className="text-[11px] text-slate-400 text-center py-3">読み込み中...</p>
      ) : rules.length === 0 && !showForm ? (
        <div className="text-center py-8">
          <Calendar className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <p className="text-xs text-slate-400 mb-3">定期イベントはまだありません</p>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="px-4 py-2 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
          >
            最初の定期イベントを作成
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => {
            const isMeeting = rule.type === 'meeting';
            const meta = rule.metadata as Record<string, unknown>;
            const startH = (meta?.start_hour as number) || 10;
            const startM = (meta?.start_minute as number) || 0;
            const duration = (meta?.duration_minutes as number) || 60;
            const participants = (meta?.participants as string[]) || [];
            const notesEnabled = (meta?.meeting_notes_enabled as boolean) ?? false;

            return (
              <div
                key={rule.id}
                className={`px-3 py-2.5 border rounded-lg ${
                  rule.enabled ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  {/* 種別アイコン */}
                  <div className={`p-1.5 rounded-lg ${isMeeting ? 'bg-blue-50' : 'bg-amber-50'}`}>
                    {isMeeting ? (
                      <Video className="w-3.5 h-3.5 text-blue-600" />
                    ) : (
                      <Briefcase className="w-3.5 h-3.5 text-amber-600" />
                    )}
                  </div>

                  {/* 情報 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">{rule.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-400">
                        {rruleToJapanese(rule.rrule)}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {String(startH).padStart(2, '0')}:{String(startM).padStart(2, '0')}〜{duration}分
                      </span>
                      {participants.length > 0 && (
                        <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                          <Users className="w-2.5 h-2.5" />{participants.length + 1}人
                        </span>
                      )}
                      {isMeeting && notesEnabled && (
                        <span className="text-[10px] text-blue-400 flex items-center gap-0.5">
                          <FileText className="w-2.5 h-2.5" />議事録
                        </span>
                      )}
                      {rule.calendar_sync && (
                        <span className="text-[10px] text-green-400 flex items-center gap-0.5">
                          <Calendar className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* アクション */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => handleToggleEnabled(rule)}
                      className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                      title={rule.enabled ? '無効にする' : '有効にする'}
                    >
                      {rule.enabled ? <ToggleRight className="w-4 h-4 text-blue-500" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => startEdit(rule)}
                      className="p-1 text-slate-400 hover:text-blue-600 transition-colors"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
