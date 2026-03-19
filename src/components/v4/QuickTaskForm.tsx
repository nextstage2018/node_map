// v4.0 + v10.4: クイックタスク追加フォーム（担当者選択付き）
'use client';

import { useState } from 'react';
import { Plus, X, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AssigneeOption {
  id: string;
  name: string;
}

interface QuickTaskFormProps {
  onSubmit: (title: string, dueDate?: string, assigneeContactId?: string) => Promise<void>;
  myContactId?: string | null;
  assignees?: AssigneeOption[];
}

export default function QuickTaskForm({ onSubmit, myContactId, assignees = [] }: QuickTaskFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assigneeId, setAssigneeId] = useState<string>(myContactId || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(
        title.trim(),
        dueDate || undefined,
        assigneeId || undefined,
      );
      setTitle('');
      setDueDate('');
      setAssigneeId(myContactId || '');
      setIsOpen(false);
    } catch (error) {
      console.error('タスク作成エラー:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => {
          setAssigneeId(myContactId || '');
          setIsOpen(true);
        }}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-sm text-slate-400 hover:text-blue-600 hover:bg-blue-50/50 rounded-lg transition-colors"
      >
        <Plus className="w-4 h-4" />
        タスクを追加
      </button>
    );
  }

  // 担当者オプション構築
  const assigneeOptions: { id: string; label: string }[] = [];
  // 自分を先頭に
  if (myContactId) {
    const myName = assignees.find(a => a.id === myContactId)?.name || '自分';
    assigneeOptions.push({ id: myContactId, label: `${myName}（自分）` });
  }
  // 他のメンバー
  assignees
    .filter(a => a.id !== myContactId)
    .forEach(a => assigneeOptions.push({ id: a.id, label: a.name }));

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-blue-200 p-3 shadow-sm">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="タスク名を入力..."
        className="w-full text-sm border-0 border-b border-slate-200 pb-2 mb-2 focus:outline-none focus:border-blue-400 placeholder:text-slate-300"
        autoFocus
      />
      <div className="flex items-center gap-2 mb-2">
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="text-xs text-slate-500 border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
        />
        {/* 担当者選択 */}
        {assigneeOptions.length > 0 && (
          <div className="relative flex items-center">
            <User className="w-3 h-3 text-slate-400 absolute left-1.5 pointer-events-none" />
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="text-xs text-slate-500 border border-slate-200 rounded pl-5 pr-2 py-1 focus:outline-none focus:border-blue-400 appearance-none bg-white max-w-[140px] truncate"
            >
              {assigneeOptions.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
              <option value="">未割り当て</option>
            </select>
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => { setIsOpen(false); setTitle(''); setDueDate(''); setAssigneeId(myContactId || ''); }}
          className="px-2 py-1 text-xs text-slate-400 hover:text-slate-600"
        >
          <X className="w-4 h-4" />
        </button>
        <button
          type="submit"
          disabled={!title.trim() || isSubmitting}
          className={cn(
            'px-3 py-1 text-xs font-medium rounded-md transition-colors',
            title.trim()
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          )}
        >
          {isSubmitting ? '...' : '追加'}
        </button>
      </div>
    </form>
  );
}
