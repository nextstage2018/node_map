'use client';

// v4.2: 繰り返しルール管理コンポーネント
// プロジェクト詳細のジョブタブ下部に配置

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Plus, Trash2, Edit2, X, Check, ToggleLeft, ToggleRight, Info } from 'lucide-react';

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
    case 'YEARLY':
      text = '毎年';
      break;
    default:
      text = rrule;
  }
  return text;
}

const typeLabels: Record<string, string> = {
  meeting: '会議',
  task: 'タスク',
  job: 'ジョブ',
};

const typeColors: Record<string, string> = {
  meeting: 'bg-blue-50 text-blue-700 border-blue-200',
  task: 'bg-green-50 text-green-700 border-green-200',
  job: 'bg-amber-50 text-amber-700 border-amber-200',
};

// RRULE テンプレート
const RRULE_TEMPLATES = [
  { label: '毎週月曜', value: 'FREQ=WEEKLY;BYDAY=MO' },
  { label: '毎週（月〜金）', value: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { label: '隔週月曜', value: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO' },
  { label: '毎月1日', value: 'FREQ=MONTHLY;BYMONTHDAY=1' },
  { label: '毎月末（28日）', value: 'FREQ=MONTHLY;BYMONTHDAY=28' },
  { label: '毎日', value: 'FREQ=DAILY' },
];

export default function RecurringRulesManager({ projectId }: Props) {
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // フォーム
  const [formType, setFormType] = useState<'meeting' | 'task' | 'job'>('meeting');
  const [formTitle, setFormTitle] = useState('');
  const [formRrule, setFormRrule] = useState('FREQ=WEEKLY;BYDAY=MO');
  const [formLeadDays, setFormLeadDays] = useState(7);
  const [formCalendarSync, setFormCalendarSync] = useState(false);
  const [formAutoCreate, setFormAutoCreate] = useState(true);
  const [formStartHour, setFormStartHour] = useState(10);
  const [formDurationMin, setFormDurationMin] = useState(60);
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

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const resetForm = () => {
    setFormType('meeting');
    setFormTitle('');
    setFormRrule('FREQ=WEEKLY;BYDAY=MO');
    setFormLeadDays(7);
    setFormCalendarSync(false);
    setFormAutoCreate(true);
    setFormStartHour(10);
    setFormDurationMin(60);
    setEditingId(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!formTitle.trim()) return;
    setIsSaving(true);

    const metadata: Record<string, unknown> = {};
    if (formType === 'meeting') {
      metadata.start_hour = formStartHour;
      metadata.duration_minutes = formDurationMin;
    }

    try {
      if (editingId) {
        await fetch(`/api/projects/${projectId}/recurring-rules/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formTitle,
            rrule: formRrule,
            lead_days: formLeadDays,
            calendar_sync: formCalendarSync,
            auto_create: formAutoCreate,
            metadata,
          }),
        });
      } else {
        await fetch(`/api/projects/${projectId}/recurring-rules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: formType,
            title: formTitle,
            rrule: formRrule,
            lead_days: formLeadDays,
            calendar_sync: formCalendarSync,
            auto_create: formAutoCreate,
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
    if (!confirm('このルールを削除しますか？')) return;
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
    setFormType(rule.type);
    setFormTitle(rule.title);
    setFormRrule(rule.rrule);
    setFormLeadDays(rule.lead_days);
    setFormCalendarSync(rule.calendar_sync);
    setFormAutoCreate(rule.auto_create);
    setFormStartHour(((rule.metadata as Record<string, unknown>)?.start_hour as number) || 10);
    setFormDurationMin(((rule.metadata as Record<string, unknown>)?.duration_minutes as number) || 60);
    setShowForm(true);
  };

  return (
    <div className="mt-6 border-t border-slate-200 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          繰り返しルール
        </h3>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-1 px-2 py-1 text-[11px] text-blue-600 hover:bg-blue-50 rounded transition-colors"
        >
          <Plus className="w-3 h-3" />
          追加
        </button>
      </div>

      {/* フォーム */}
      {showForm && (
        <div className="mb-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="text-[10px] text-slate-500 mb-0.5 block">種別</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as 'meeting' | 'task' | 'job')}
                disabled={!!editingId}
                className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="meeting">会議</option>
                <option value="task">タスク</option>
                <option value="job">ジョブ</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-0.5 block">事前生成（日前）</label>
              <input
                type="number" min={1} max={30} value={formLeadDays}
                onChange={(e) => setFormLeadDays(parseInt(e.target.value, 10) || 7)}
                className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="mb-2">
            <label className="text-[10px] text-slate-500 mb-0.5 block">タイトル</label>
            <input
              type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)}
              placeholder="例: 週次定例MTG" autoFocus
              className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="mb-2">
            <label className="text-[10px] text-slate-500 mb-0.5 block">繰り返し</label>
            <select
              value={RRULE_TEMPLATES.some(t => t.value === formRrule) ? formRrule : '__custom'}
              onChange={(e) => {
                if (e.target.value !== '__custom') setFormRrule(e.target.value);
              }}
              className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 mb-1"
            >
              {RRULE_TEMPLATES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
              <option value="__custom">カスタム RRULE</option>
            </select>
            {!RRULE_TEMPLATES.some(t => t.value === formRrule) && (
              <input
                type="text" value={formRrule} onChange={(e) => setFormRrule(e.target.value)}
                placeholder="FREQ=WEEKLY;BYDAY=MO"
                className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            )}
          </div>

          {formType === 'meeting' && (
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-[10px] text-slate-500 mb-0.5 block">開始時刻</label>
                <select
                  value={formStartHour}
                  onChange={(e) => setFormStartHour(parseInt(e.target.value, 10))}
                  className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 8).map(h => (
                    <option key={h} value={h}>{`${h}:00`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 mb-0.5 block">所要時間（分）</label>
                <select
                  value={formDurationMin}
                  onChange={(e) => setFormDurationMin(parseInt(e.target.value, 10))}
                  className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {[15, 30, 45, 60, 90, 120].map(m => (
                    <option key={m} value={m}>{m}分</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 mb-2 text-[11px]">
            <div className="relative group">
              <label className="flex items-center gap-1 text-slate-600 cursor-pointer">
                <input type="checkbox" checked={formAutoCreate} onChange={(e) => setFormAutoCreate(e.target.checked)} className="rounded" />
                自動生成
                <Info className="w-3 h-3 text-slate-400" />
              </label>
              <div className="absolute bottom-full left-0 mb-1 w-56 px-2.5 py-1.5 bg-slate-800 text-white text-[10px] rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 leading-relaxed">
                ONにすると、設定した周期の「事前生成日数」前にタスクやジョブが自動作成されます。毎日のCronジョブが自動実行します。
              </div>
            </div>
            {formType === 'meeting' && (
              <div className="relative group">
                <label className="flex items-center gap-1 text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={formCalendarSync} onChange={(e) => setFormCalendarSync(e.target.checked)} className="rounded" />
                  カレンダー同期
                  <Info className="w-3 h-3 text-slate-400" />
                </label>
                <div className="absolute bottom-full left-0 mb-1 w-56 px-2.5 py-1.5 bg-slate-800 text-white text-[10px] rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 leading-relaxed">
                  ONにすると、会議がGoogleカレンダーにも自動登録されます。Google Calendar連携（設定画面）が必要です。
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-1.5">
            <button onClick={resetForm} className="px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-100 rounded">
              <X className="w-3 h-3 inline mr-0.5" />キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !formTitle.trim()}
              className="px-3 py-1 text-[11px] bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              <Check className="w-3 h-3 inline mr-0.5" />
              {editingId ? '更新' : '作成'}
            </button>
          </div>
        </div>
      )}

      {/* ルール一覧 */}
      {isLoading ? (
        <p className="text-[11px] text-slate-400 text-center py-3">読み込み中...</p>
      ) : rules.length === 0 ? (
        <p className="text-[11px] text-slate-400 text-center py-3">繰り返しルールはまだありません</p>
      ) : (
        <div className="space-y-1.5">
          {rules.map(rule => (
            <div
              key={rule.id}
              className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-xs ${
                rule.enabled ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-60'
              }`}
            >
              <span className={`px-1.5 py-0.5 text-[10px] rounded border ${typeColors[rule.type]}`}>
                {typeLabels[rule.type]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-slate-700 font-medium truncate">{rule.title}</p>
                <p className="text-[10px] text-slate-400">
                  {rruleToJapanese(rule.rrule)} / {rule.lead_days}日前生成 / {rule.occurrence_count}回実行
                </p>
              </div>
              <div className="flex items-center gap-1">
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
          ))}
        </div>
      )}
    </div>
  );
}
