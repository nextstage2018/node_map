'use client';

import { useState, useEffect, useCallback } from 'react';
import { ProjectType, TaskTemplate, RecurrenceType } from '@/lib/types';
import Button from '@/components/ui/Button';

const RECURRENCE_LABELS: Record<string, string> = {
  weekly: '毎週',
  biweekly: '隔週',
  monthly: '毎月',
};

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function formatRecurrence(type?: RecurrenceType | null, day?: number | null): string {
  if (!type) return '単発';
  const label = RECURRENCE_LABELS[type] || type;
  if (type === 'monthly' && day !== undefined && day !== null) {
    return `${label}${day}日`;
  }
  if ((type === 'weekly' || type === 'biweekly') && day !== undefined && day !== null) {
    return `${label}${DAY_LABELS[day] || ''}曜`;
  }
  return label;
}

interface TemplateFormData {
  title: string;
  description: string;
  estimatedHours: string;
  recurrenceType: string;
  recurrenceDay: string;
}

const EMPTY_TEMPLATE: TemplateFormData = {
  title: '',
  description: '',
  estimatedHours: '',
  recurrenceType: '',
  recurrenceDay: '',
};

export default function ProjectTypeManager() {
  const [types, setTypes] = useState<ProjectType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeDesc, setNewTypeDesc] = useState('');
  const [showAddType, setShowAddType] = useState(false);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editTypeName, setEditTypeName] = useState('');
  const [editTypeDesc, setEditTypeDesc] = useState('');
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(null);
  const [addingTemplateForTypeId, setAddingTemplateForTypeId] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState<TemplateFormData>(EMPTY_TEMPLATE);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchTypes = useCallback(async () => {
    try {
      const res = await fetch('/api/project-types');
      const data = await res.json();
      if (data.success) {
        setTypes(data.data);
      }
    } catch {
      // サイレント
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTypes();
  }, [fetchTypes]);

  // === 種別 CRUD ===
  const handleAddType = async () => {
    if (!newTypeName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/project-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTypeName, description: newTypeDesc }),
      });
      const data = await res.json();
      if (data.success) {
        setTypes((prev) => [...prev, data.data]);
        setNewTypeName('');
        setNewTypeDesc('');
        setShowAddType(false);
      }
    } catch {
      // error
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateType = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/project-types', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: editTypeName, description: editTypeDesc }),
      });
      const data = await res.json();
      if (data.success) {
        setTypes((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, name: editTypeName, description: editTypeDesc } : t
          )
        );
        setEditingTypeId(null);
      }
    } catch {
      // error
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteType = async (id: string) => {
    if (!confirm('この種別とすべてのテンプレートを削除しますか？')) return;
    try {
      const res = await fetch(`/api/project-types?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setTypes((prev) => prev.filter((t) => t.id !== id));
      }
    } catch {
      // error
    }
  };

  // === テンプレート CRUD ===
  const handleAddTemplate = async (projectTypeId: string) => {
    if (!templateForm.title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/project-types/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectTypeId,
          title: templateForm.title,
          description: templateForm.description || undefined,
          estimatedHours: templateForm.estimatedHours ? parseFloat(templateForm.estimatedHours) : undefined,
          recurrenceType: templateForm.recurrenceType || undefined,
          recurrenceDay: templateForm.recurrenceDay ? parseInt(templateForm.recurrenceDay) : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTypes((prev) =>
          prev.map((t) =>
            t.id === projectTypeId
              ? { ...t, templates: [...(t.templates || []), data.data] }
              : t
          )
        );
        setTemplateForm(EMPTY_TEMPLATE);
        setAddingTemplateForTypeId(null);
      }
    } catch {
      // error
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTemplate = async (templateId: string, projectTypeId: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/project-types/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: templateId,
          title: templateForm.title,
          description: templateForm.description || undefined,
          estimatedHours: templateForm.estimatedHours ? parseFloat(templateForm.estimatedHours) : undefined,
          recurrenceType: templateForm.recurrenceType || undefined,
          recurrenceDay: templateForm.recurrenceDay ? parseInt(templateForm.recurrenceDay) : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTypes((prev) =>
          prev.map((t) =>
            t.id === projectTypeId
              ? {
                  ...t,
                  templates: (t.templates || []).map((tmpl) =>
                    tmpl.id === templateId ? data.data : tmpl
                  ),
                }
              : t
          )
        );
        setEditingTemplateId(null);
        setTemplateForm(EMPTY_TEMPLATE);
      }
    } catch {
      // error
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (templateId: string, projectTypeId: string) => {
    try {
      const res = await fetch(`/api/project-types/templates?id=${templateId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setTypes((prev) =>
          prev.map((t) =>
            t.id === projectTypeId
              ? { ...t, templates: (t.templates || []).filter((tmpl) => tmpl.id !== templateId) }
              : t
          )
        );
      }
    } catch {
      // error
    }
  };

  const startEditTemplate = (tmpl: TaskTemplate) => {
    setEditingTemplateId(tmpl.id);
    setAddingTemplateForTypeId(null);
    setTemplateForm({
      title: tmpl.title,
      description: tmpl.description || '',
      estimatedHours: tmpl.estimatedHours?.toString() || '',
      recurrenceType: tmpl.recurrenceType || '',
      recurrenceDay: tmpl.recurrenceDay?.toString() || '',
    });
  };

  if (isLoading) {
    return <div className="text-sm text-slate-400 py-4">読み込み中...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-slate-600">
          プロジェクトの種別を登録すると、プロジェクト作成時にテンプレートからタスクを自動生成できます。
        </p>
      </div>

      {/* 種別一覧 */}
      {types.map((pt) => (
        <div
          key={pt.id}
          className="border border-slate-200 rounded-xl overflow-hidden"
        >
          {/* 種別ヘッダー */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50">
            {editingTypeId === pt.id ? (
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="text"
                  value={editTypeName}
                  onChange={(e) => setEditTypeName(e.target.value)}
                  className="flex-1 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <Button
                  size="sm"
                  onClick={() => handleUpdateType(pt.id)}
                  disabled={saving}
                >
                  保存
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setEditingTypeId(null)}
                >
                  取消
                </Button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setExpandedTypeId(expandedTypeId === pt.id ? null : pt.id)}
                  className="flex items-center gap-2 text-left flex-1"
                >
                  <span className="text-xs text-slate-400">
                    {expandedTypeId === pt.id ? '▼' : '▶'}
                  </span>
                  <span className="font-medium text-slate-900">{pt.name}</span>
                  <span className="text-xs text-slate-400">
                    ({(pt.templates || []).length}件のテンプレート)
                  </span>
                </button>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingTypeId(pt.id);
                      setEditTypeName(pt.name);
                      setEditTypeDesc(pt.description || '');
                    }}
                    className="text-xs text-slate-400 hover:text-blue-600 px-2 py-1"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => handleDeleteType(pt.id)}
                    className="text-xs text-slate-400 hover:text-red-600 px-2 py-1"
                  >
                    削除
                  </button>
                </div>
              </>
            )}
          </div>

          {/* テンプレート一覧（展開時） */}
          {expandedTypeId === pt.id && (
            <div className="px-4 py-3 space-y-2">
              {(pt.templates || []).length === 0 && !addingTemplateForTypeId && (
                <p className="text-xs text-slate-400 py-2">
                  テンプレートがまだありません。「タスクを追加」で定型タスクを登録しましょう。
                </p>
              )}

              {(pt.templates || []).map((tmpl) => (
                <div key={tmpl.id}>
                  {editingTemplateId === tmpl.id ? (
                    <TemplateFormRow
                      form={templateForm}
                      onChange={setTemplateForm}
                      onSave={() => handleUpdateTemplate(tmpl.id, pt.id)}
                      onCancel={() => {
                        setEditingTemplateId(null);
                        setTemplateForm(EMPTY_TEMPLATE);
                      }}
                      saving={saving}
                      isEdit
                    />
                  ) : (
                    <div className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-slate-50 group">
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-slate-700">{tmpl.title}</span>
                        {tmpl.estimatedHours && (
                          <span className="text-xs text-slate-400">
                            {tmpl.estimatedHours}h
                          </span>
                        )}
                        <span className="text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
                          {formatRecurrence(tmpl.recurrenceType, tmpl.recurrenceDay)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEditTemplate(tmpl)}
                          className="text-xs text-slate-400 hover:text-blue-600 px-2 py-1"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(tmpl.id, pt.id)}
                          className="text-xs text-slate-400 hover:text-red-600 px-2 py-1"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* テンプレート追加フォーム */}
              {addingTemplateForTypeId === pt.id ? (
                <TemplateFormRow
                  form={templateForm}
                  onChange={setTemplateForm}
                  onSave={() => handleAddTemplate(pt.id)}
                  onCancel={() => {
                    setAddingTemplateForTypeId(null);
                    setTemplateForm(EMPTY_TEMPLATE);
                  }}
                  saving={saving}
                />
              ) : (
                <button
                  onClick={() => {
                    setAddingTemplateForTypeId(pt.id);
                    setEditingTemplateId(null);
                    setTemplateForm(EMPTY_TEMPLATE);
                  }}
                  className="text-xs text-blue-600 hover:text-blue-700 py-1.5 px-3"
                >
                  + タスクを追加
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {/* 新しい種別追加 */}
      {showAddType ? (
        <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/50 space-y-3">
          <input
            type="text"
            value={newTypeName}
            onChange={(e) => setNewTypeName(e.target.value)}
            placeholder="種別名（例：広告運用、Web制作）"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <input
            type="text"
            value={newTypeDesc}
            onChange={(e) => setNewTypeDesc(e.target.value)}
            placeholder="説明（任意）"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAddType} disabled={saving || !newTypeName.trim()}>
              {saving ? '作成中...' : '作成'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setShowAddType(false);
                setNewTypeName('');
                setNewTypeDesc('');
              }}
            >
              キャンセル
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddType(true)}
          className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
        >
          + 新しい種別を追加
        </button>
      )}
    </div>
  );
}

// テンプレート入力行
function TemplateFormRow({
  form,
  onChange,
  onSave,
  onCancel,
  saving,
  isEdit,
}: {
  form: TemplateFormData;
  onChange: (f: TemplateFormData) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isEdit?: boolean;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={form.title}
          onChange={(e) => onChange({ ...form, title: e.target.value })}
          placeholder="タスク名"
          className="flex-1 px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          autoFocus
        />
        <input
          type="number"
          value={form.estimatedHours}
          onChange={(e) => onChange({ ...form, estimatedHours: e.target.value })}
          placeholder="時間"
          step="0.5"
          min="0"
          className="w-20 px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div className="flex gap-2">
        <select
          value={form.recurrenceType}
          onChange={(e) => onChange({ ...form, recurrenceType: e.target.value })}
          className="px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
        >
          <option value="">単発</option>
          <option value="weekly">毎週</option>
          <option value="biweekly">隔週</option>
          <option value="monthly">毎月</option>
        </select>
        {(form.recurrenceType === 'weekly' || form.recurrenceType === 'biweekly') && (
          <select
            value={form.recurrenceDay}
            onChange={(e) => onChange({ ...form, recurrenceDay: e.target.value })}
            className="px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="">曜日</option>
            {DAY_LABELS.map((d, i) => (
              <option key={i} value={i}>
                {d}曜日
              </option>
            ))}
          </select>
        )}
        {form.recurrenceType === 'monthly' && (
          <input
            type="number"
            value={form.recurrenceDay}
            onChange={(e) => onChange({ ...form, recurrenceDay: e.target.value })}
            placeholder="日"
            min="1"
            max="31"
            className="w-16 px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        )}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} disabled={saving || !form.title.trim()}>
          {saving ? '保存中...' : isEdit ? '更新' : '追加'}
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>
          キャンセル
        </Button>
      </div>
    </div>
  );
}
