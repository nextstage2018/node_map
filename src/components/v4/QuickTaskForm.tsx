// v4.0: クイックタスク追加フォーム
'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuickTaskFormProps {
  onSubmit: (title: string, dueDate?: string) => Promise<void>;
}

export default function QuickTaskForm({ onSubmit }: QuickTaskFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(title.trim(), dueDate || undefined);
      setTitle('');
      setDueDate('');
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
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-sm text-slate-400 hover:text-blue-600 hover:bg-blue-50/50 rounded-lg transition-colors"
      >
        <Plus className="w-4 h-4" />
        タスクを追加
      </button>
    );
  }

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
      <div className="flex items-center justify-between gap-2">
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="text-xs text-slate-500 border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
        />
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => { setIsOpen(false); setTitle(''); setDueDate(''); }}
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
      </div>
    </form>
  );
}
