// v4.0: AI提案カード（チームタスクのAI提案列用）
'use client';

import { useState } from 'react';
import { Sparkles, Calendar, User, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ProposalItem {
  title: string;
  assignee?: string;
  assigneeContactId?: string;
  due_date?: string;
  priority?: string;
  related_topic?: string;
}

export interface AiProposal {
  id: string;           // task_suggestions.id
  meeting_title?: string;
  created_at: string;
  items: ProposalItem[];
}

interface AiProposalCardProps {
  proposal: AiProposal;
  onApprove: (proposalId: string, items: ProposalItem[]) => void;
  onDismiss: (proposalId: string) => void;
}

export default function AiProposalCard({ proposal, onApprove, onDismiss }: AiProposalCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(
    new Set(proposal.items.map((_, i) => i))
  );

  const toggleItem = (index: number) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleApprove = () => {
    const selected = proposal.items.filter((_, i) => selectedItems.has(i));
    if (selected.length > 0) {
      onApprove(proposal.id, selected);
    }
  };

  const PRIORITY_COLOR: Record<string, string> = {
    high: 'text-red-500 bg-red-50',
    medium: 'text-amber-500 bg-amber-50',
    low: 'text-slate-400 bg-slate-50',
  };

  return (
    <div className="rounded-lg border border-indigo-200 bg-white overflow-hidden">
      {/* ヘッダー */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 bg-indigo-50/50 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-indigo-700 truncate">
            {proposal.meeting_title || 'AI提案'}
          </div>
          <div className="text-[10px] text-indigo-400">
            {proposal.items.length}件のタスク提案
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-indigo-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-indigo-400" />
        )}
      </div>

      {/* 展開時: アイテムリスト */}
      {isExpanded && (
        <div className="px-3 py-2 space-y-1.5 border-t border-indigo-100">
          {proposal.items.map((item, index) => (
            <label
              key={index}
              className={cn(
                'flex items-start gap-2 p-2 rounded-md cursor-pointer transition-colors',
                selectedItems.has(index) ? 'bg-indigo-50' : 'bg-slate-50 opacity-60'
              )}
            >
              <input
                type="checkbox"
                checked={selectedItems.has(index)}
                onChange={() => toggleItem(index)}
                className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-nm-text line-clamp-2">{item.title}</div>
                <div className="flex items-center gap-2 mt-1">
                  {item.assignee && (
                    <span className="flex items-center gap-0.5 text-[10px] text-slate-500">
                      <User className="w-3 h-3" />{item.assignee}
                    </span>
                  )}
                  {item.due_date && (
                    <span className="flex items-center gap-0.5 text-[10px] text-slate-500">
                      <Calendar className="w-3 h-3" />{item.due_date}
                    </span>
                  )}
                  {item.priority && (
                    <span className={cn('text-[10px] px-1 rounded', PRIORITY_COLOR[item.priority] || '')}>
                      {item.priority}
                    </span>
                  )}
                </div>
              </div>
            </label>
          ))}

          {/* アクションボタン */}
          <div className="flex gap-2 pt-1.5">
            <button
              onClick={handleApprove}
              disabled={selectedItems.size === 0}
              className={cn(
                'flex-1 py-1.5 text-xs font-medium rounded-md transition-colors',
                selectedItems.size > 0
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              )}
            >
              承認して登録 ({selectedItems.size}件)
            </button>
            <button
              onClick={() => onDismiss(proposal.id)}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
            >
              却下
            </button>
          </div>
        </div>
      )}

      {/* 折りたたみ時: サマリー */}
      {!isExpanded && (
        <div className="px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {proposal.items.slice(0, 2).map((item, i) => (
              <span key={i} className="text-[10px] text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 truncate max-w-[100px]">
                {item.title}
              </span>
            ))}
            {proposal.items.length > 2 && (
              <span className="text-[10px] text-slate-400">+{proposal.items.length - 2}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
