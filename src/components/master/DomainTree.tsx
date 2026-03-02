'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, X, Check, Loader2, ExternalLink } from 'lucide-react';
import Button from '@/components/ui/Button';
import type { KnowledgeHierarchy } from '@/lib/types';

interface DomainTreeProps {
  hierarchy: KnowledgeHierarchy;
  searchQuery: string;
  onDataChanged: () => void;
}

// 色プリセット
const COLOR_PRESETS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

export default function DomainTree({ hierarchy, searchQuery, onDataChanged }: DomainTreeProps) {
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(
    new Set(hierarchy.domains.map((d) => d.id))
  );
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());

  // 追加フォーム
  const [addingDomain, setAddingDomain] = useState(false);
  const [addingFieldToDomain, setAddingFieldToDomain] = useState<string | null>(null);
  const [addingEntryToField, setAddingEntryToField] = useState<string | null>(null);

  // 編集
  const [editingDomain, setEditingDomain] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);

  // キーワード詳細
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);

  // 処理中フラグ
  const [processing, setProcessing] = useState(false);

  const toggleDomain = (id: string) => {
    setExpandedDomains((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleField = (id: string) => {
    setExpandedFields((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const q = searchQuery.toLowerCase();

  return (
    <div className="space-y-2">
      {/* 領域追加ボタン */}
      {!addingDomain && (
        <button
          onClick={() => setAddingDomain(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-xl border border-dashed border-blue-300 w-full transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          領域を追加
        </button>
      )}

      {addingDomain && (
        <AddDomainForm
          onSubmit={async (name, desc, color) => {
            setProcessing(true);
            await fetch('/api/master/domains', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, description: desc, color }),
            });
            setAddingDomain(false);
            setProcessing(false);
            onDataChanged();
          }}
          onCancel={() => setAddingDomain(false)}
          isProcessing={processing}
        />
      )}

      {hierarchy.domains.map((domain) => {
        // 検索フィルター
        const filteredFields = domain.fields
          .map((field) => {
            const filteredEntries = field.entries.filter((e) =>
              !q ||
              e.label.toLowerCase().includes(q) ||
              e.synonyms.some((s) => s.toLowerCase().includes(q))
            );
            if (!q || field.name.toLowerCase().includes(q) || filteredEntries.length > 0) {
              return { ...field, entries: q ? filteredEntries : field.entries };
            }
            return null;
          })
          .filter(Boolean) as typeof domain.fields;

        if (q && filteredFields.length === 0 && !domain.name.toLowerCase().includes(q)) {
          return null;
        }

        const isExpanded = expandedDomains.has(domain.id);
        const totalNodes = domain.fields.reduce((sum, f) => sum + f.nodeCount, 0);

        return (
          <div key={domain.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* 領域ヘッダー */}
            {editingDomain === domain.id ? (
              <EditDomainForm
                domain={domain}
                onSubmit={async (name, desc, color) => {
                  setProcessing(true);
                  await fetch('/api/master/domains', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: domain.id, name, description: desc, color }),
                  });
                  setEditingDomain(null);
                  setProcessing(false);
                  onDataChanged();
                }}
                onCancel={() => setEditingDomain(null)}
                isProcessing={processing}
              />
            ) : (
              <div className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors group">
                <button onClick={() => toggleDomain(domain.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: domain.color }} />
                  <div className="flex-1 text-left min-w-0">
                    <span className="font-medium text-slate-900">{domain.name}</span>
                    <span className="ml-2 text-xs text-slate-400">{domain.description}</span>
                  </div>
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                    {totalNodes}ノード
                  </span>
                </button>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => setEditingDomain(domain.id)} className="p-1 rounded hover:bg-slate-200 text-slate-400" title="編集">
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm(`「${domain.name}」を削除しますか？配下の分野とキーワードもすべて削除されます。`)) return;
                      await fetch(`/api/master/domains?id=${domain.id}`, { method: 'DELETE' });
                      onDataChanged();
                    }}
                    className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-500"
                    title="削除"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <svg
                  className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            )}

            {/* 分野一覧 */}
            {isExpanded && (
              <div className="border-t border-slate-100">
                {(q ? filteredFields : domain.fields).map((field) => {
                  const fieldExpanded = expandedFields.has(field.id);
                  return (
                    <div key={field.id} className="border-b border-slate-50 last:border-b-0">
                      {editingField === field.id ? (
                        <EditFieldForm
                          field={field}
                          onSubmit={async (name, desc) => {
                            setProcessing(true);
                            await fetch('/api/master/fields', {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ id: field.id, name, description: desc }),
                            });
                            setEditingField(null);
                            setProcessing(false);
                            onDataChanged();
                          }}
                          onCancel={() => setEditingField(null)}
                          isProcessing={processing}
                        />
                      ) : (
                        <div className="w-full flex items-center gap-2 px-6 py-2.5 hover:bg-slate-50 transition-colors group">
                          <button onClick={() => toggleField(field.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                            <svg
                              className={`w-3 h-3 text-slate-400 transition-transform shrink-0 ${fieldExpanded ? 'rotate-90' : ''}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <span className="text-sm font-medium text-slate-700">{field.name}</span>
                            <span className="text-xs text-slate-400">{field.description}</span>
                            <span className="ml-auto text-xs text-slate-400 shrink-0">
                              {field.entries.length}件 / {field.nodeCount}ノード
                            </span>
                          </button>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button onClick={() => setEditingField(field.id)} className="p-1 rounded hover:bg-slate-200 text-slate-400" title="編集">
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={async () => {
                                if (!confirm(`「${field.name}」を削除しますか？`)) return;
                                await fetch(`/api/master/fields?id=${field.id}`, { method: 'DELETE' });
                                onDataChanged();
                              }}
                              className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-500"
                              title="削除"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* キーワード一覧 */}
                      {fieldExpanded && (
                        <div className="px-8 pb-2 space-y-1">
                          {field.entries.map((entry) => (
                            <div
                              key={entry.id}
                              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors ${
                                selectedEntry === entry.id ? 'bg-blue-50 border border-blue-200' : 'bg-slate-50 hover:bg-slate-100'
                              }`}
                              onClick={() => setSelectedEntry(selectedEntry === entry.id ? null : entry.id)}
                            >
                              <span className="text-slate-700 font-medium">{entry.label}</span>
                              {entry.synonyms.length > 0 && (
                                <span className="text-xs text-slate-400">
                                  ({entry.synonyms.slice(0, 3).join(', ')}
                                  {entry.synonyms.length > 3 && ` +${entry.synonyms.length - 3}`})
                                </span>
                              )}
                              <div className="flex gap-1 ml-auto shrink-0">
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!confirm(`「${entry.label}」を削除しますか？`)) return;
                                    await fetch(`/api/master/entries?id=${entry.id}`, { method: 'DELETE' });
                                    onDataChanged();
                                  }}
                                  className="p-0.5 rounded hover:bg-red-100 text-slate-300 hover:text-red-500"
                                  title="削除"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}

                          {/* キーワード詳細パネル */}
                          {selectedEntry && field.entries.find((e) => e.id === selectedEntry) && (
                            <EntryDetailPanel
                              entry={field.entries.find((e) => e.id === selectedEntry)!}
                              onUpdate={onDataChanged}
                              onClose={() => setSelectedEntry(null)}
                            />
                          )}

                          {/* キーワード追加 */}
                          {addingEntryToField === field.id ? (
                            <AddEntryForm
                              onSubmit={async (label, synonyms) => {
                                setProcessing(true);
                                await fetch('/api/master/entries', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ fieldId: field.id, label, synonyms }),
                                });
                                setAddingEntryToField(null);
                                setProcessing(false);
                                onDataChanged();
                              }}
                              onCancel={() => setAddingEntryToField(null)}
                              isProcessing={processing}
                            />
                          ) : (
                            <button
                              onClick={() => setAddingEntryToField(field.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-blue-500 hover:bg-blue-50 rounded-lg transition-colors w-full"
                            >
                              <Plus className="w-3 h-3" />
                              キーワード追加
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 分野追加 */}
                {addingFieldToDomain === domain.id ? (
                  <div className="px-6 py-2">
                    <AddFieldForm
                      onSubmit={async (name, desc) => {
                        setProcessing(true);
                        await fetch('/api/master/fields', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ domainId: domain.id, name, description: desc }),
                        });
                        setAddingFieldToDomain(null);
                        setProcessing(false);
                        onDataChanged();
                      }}
                      onCancel={() => setAddingFieldToDomain(null)}
                      isProcessing={processing}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingFieldToDomain(domain.id)}
                    className="flex items-center gap-1.5 px-6 py-2.5 text-xs text-blue-500 hover:bg-blue-50 transition-colors w-full"
                  >
                    <Plus className="w-3 h-3" />
                    分野を追加
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ========================================
// インラインフォーム群
// ========================================

function AddDomainForm({ onSubmit, onCancel, isProcessing }: {
  onSubmit: (name: string, desc: string, color: string) => Promise<void>;
  onCancel: () => void;
  isProcessing: boolean;
}) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState(COLOR_PRESETS[0]);

  return (
    <div className="bg-white rounded-xl border border-blue-200 p-4 space-y-2">
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="領域名" autoFocus
        className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="説明"
        className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <div className="flex gap-1.5">
        {COLOR_PRESETS.map((c) => (
          <button key={c} onClick={() => setColor(c)}
            className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-slate-900' : 'border-transparent'}`}
            style={{ backgroundColor: c }} />
        ))}
      </div>
      <div className="flex gap-2">
        <Button onClick={() => onSubmit(name, desc, color)} disabled={!name.trim() || !desc.trim() || isProcessing} variant="primary" size="sm">
          {isProcessing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}追加
        </Button>
        <Button onClick={onCancel} variant="outline" size="sm">取消</Button>
      </div>
    </div>
  );
}

function EditDomainForm({ domain, onSubmit, onCancel, isProcessing }: {
  domain: { name: string; description: string; color: string };
  onSubmit: (name: string, desc: string, color: string) => Promise<void>;
  onCancel: () => void;
  isProcessing: boolean;
}) {
  const [name, setName] = useState(domain.name);
  const [desc, setDesc] = useState(domain.description);
  const [color, setColor] = useState(domain.color);

  return (
    <div className="px-4 py-3 bg-blue-50 space-y-2">
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus
        className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)}
        className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <div className="flex gap-1.5">
        {COLOR_PRESETS.map((c) => (
          <button key={c} onClick={() => setColor(c)}
            className={`w-5 h-5 rounded-full border-2 ${color === c ? 'border-slate-900' : 'border-transparent'}`}
            style={{ backgroundColor: c }} />
        ))}
      </div>
      <div className="flex gap-2">
        <Button onClick={() => onSubmit(name, desc, color)} disabled={!name.trim() || isProcessing} variant="primary" size="sm">保存</Button>
        <Button onClick={onCancel} variant="outline" size="sm">取消</Button>
      </div>
    </div>
  );
}

function AddFieldForm({ onSubmit, onCancel, isProcessing }: {
  onSubmit: (name: string, desc: string) => Promise<void>;
  onCancel: () => void;
  isProcessing: boolean;
}) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  return (
    <div className="bg-blue-50 rounded-lg p-3 space-y-2">
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="分野名" autoFocus
        className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="説明"
        className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <div className="flex gap-2">
        <Button onClick={() => onSubmit(name, desc)} disabled={!name.trim() || !desc.trim() || isProcessing} variant="primary" size="sm">追加</Button>
        <Button onClick={onCancel} variant="outline" size="sm">取消</Button>
      </div>
    </div>
  );
}

function EditFieldForm({ field, onSubmit, onCancel, isProcessing }: {
  field: { name: string; description: string };
  onSubmit: (name: string, desc: string) => Promise<void>;
  onCancel: () => void;
  isProcessing: boolean;
}) {
  const [name, setName] = useState(field.name);
  const [desc, setDesc] = useState(field.description);

  return (
    <div className="px-6 py-2.5 bg-blue-50 flex gap-2 items-center">
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus
        className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)}
        className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <button onClick={() => onSubmit(name, desc)} disabled={!name.trim() || isProcessing}
        className="p-1 rounded hover:bg-green-100 text-green-600 disabled:opacity-50"><Check className="w-4 h-4" /></button>
      <button onClick={onCancel} className="p-1 rounded hover:bg-slate-200 text-slate-400"><X className="w-4 h-4" /></button>
    </div>
  );
}

function AddEntryForm({ onSubmit, onCancel, isProcessing }: {
  onSubmit: (label: string, synonyms: string[]) => Promise<void>;
  onCancel: () => void;
  isProcessing: boolean;
}) {
  const [label, setLabel] = useState('');
  const [synonymsText, setSynonymsText] = useState('');

  return (
    <div className="bg-blue-50 rounded-lg p-2.5 space-y-1.5">
      <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="キーワード" autoFocus
        className="w-full px-2.5 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <input type="text" value={synonymsText} onChange={(e) => setSynonymsText(e.target.value)} placeholder="同義語（カンマ区切り）"
        className="w-full px-2.5 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <div className="flex gap-1.5">
        <Button onClick={() => onSubmit(label, synonymsText ? synonymsText.split(',').map(s => s.trim()).filter(Boolean) : [])}
          disabled={!label.trim() || isProcessing} variant="primary" size="xs">追加</Button>
        <Button onClick={onCancel} variant="outline" size="xs">取消</Button>
      </div>
    </div>
  );
}

// ========================================
// キーワード詳細パネル（同義語編集 + 関連タスク表示）
// ========================================
function EntryDetailPanel({ entry, onUpdate, onClose }: {
  entry: { id: string; label: string; synonyms: string[]; description?: string };
  onUpdate: () => void;
  onClose: () => void;
}) {
  const [synonymsText, setSynonymsText] = useState(entry.synonyms.join(', '));
  const [description, setDescription] = useState(entry.description || '');
  const [relatedTasks, setRelatedTasks] = useState<any[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // 関連タスク取得
  useState(() => {
    fetch(`/api/nodes/thought?entryId=${entry.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) setRelatedTasks(d.data || []);
      })
      .catch(() => {})
      .finally(() => setIsLoadingTasks(false));
  });

  const handleSave = async () => {
    setIsSaving(true);
    const synonyms = synonymsText ? synonymsText.split(',').map(s => s.trim()).filter(Boolean) : [];
    await fetch('/api/master/entries', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entry.id, synonyms, description: description || null }),
    });
    setIsSaving(false);
    onUpdate();
  };

  return (
    <div className="mt-2 p-3 bg-white border border-blue-200 rounded-lg space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-900">{entry.label}</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-400"><X className="w-3.5 h-3.5" /></button>
      </div>

      {/* 同義語編集 */}
      <div>
        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">同義語（カンマ区切り）</label>
        <input
          type="text"
          value={synonymsText}
          onChange={(e) => setSynonymsText(e.target.value)}
          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* 説明編集 */}
      <div>
        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">説明</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="キーワードの説明"
          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <Button onClick={handleSave} disabled={isSaving} variant="primary" size="xs">
        {isSaving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}保存
      </Button>

      {/* 関連タスク */}
      <div>
        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">関連タスク</label>
        {isLoadingTasks ? (
          <p className="text-[10px] text-slate-400">読み込み中...</p>
        ) : relatedTasks.length === 0 ? (
          <p className="text-[10px] text-slate-400">関連タスクなし</p>
        ) : (
          <div className="space-y-1">
            {relatedTasks.map((task: any) => (
              <a
                key={task.task_id || task.seed_id}
                href={task.task_id ? `/tasks` : `/seeds`}
                className="flex items-center gap-1.5 text-[11px] text-blue-600 hover:text-blue-800 hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                {task.task_title || task.seed_title || (task.task_id ? `タスク ${task.task_id.slice(0, 8)}` : `種 ${task.seed_id?.slice(0, 8)}`)}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
