// v4.0: 担当者選択モーダル
'use client';

import { useState, useEffect } from 'react';
import { X, User, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProposalItem } from './AiProposalCard';

interface ProjectMember {
  contact_id: string;
  display_name: string;
  role: string;
}

interface AssigneeSelectorProps {
  projectId: string;
  items: ProposalItem[];
  onConfirm: (assignments: Array<{ item: ProposalItem; assigned_contact_id?: string }>) => void;
  onCancel: () => void;
}

export default function AssigneeSelector({ projectId, items, onConfirm, onCancel }: AssigneeSelectorProps) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [assignments, setAssignments] = useState<Record<number, string>>({});

  // プロジェクトメンバー取得
  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/members`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data) {
            setMembers(data.data.map((m: { contact_id: string; contact_persons?: { display_name?: string }; role: string }) => ({
              contact_id: m.contact_id,
              display_name: m.contact_persons?.display_name || '名前なし',
              role: m.role,
            })));
          }
        }
      } catch (error) {
        console.error('メンバー取得エラー:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchMembers();
  }, [projectId]);

  // AI推定の担当者があれば初期値に設定
  useEffect(() => {
    const initial: Record<number, string> = {};
    items.forEach((item, index) => {
      if (item.assigneeContactId) {
        initial[index] = item.assigneeContactId;
      }
    });
    setAssignments(initial);
  }, [items]);

  const handleConfirm = () => {
    const result = items.map((item, index) => ({
      item,
      assigned_contact_id: assignments[index] || undefined,
    }));
    onConfirm(result);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-nm-text">担当者を割り当て</h3>
            <p className="text-xs text-nm-text-secondary mt-0.5">{items.length}件のタスクにメンバーを割り当てます</p>
          </div>
          <button onClick={onCancel} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* アイテムリスト */}
        <div className="overflow-y-auto max-h-[50vh] px-5 py-3 space-y-3">
          {isLoading ? (
            <div className="text-center py-8 text-slate-400 text-sm">メンバーを読み込み中...</div>
          ) : (
            items.map((item, index) => (
              <div key={index} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-nm-text line-clamp-1">{item.title}</div>
                  {item.due_date && (
                    <div className="text-[10px] text-slate-400 mt-0.5">期限: {item.due_date}</div>
                  )}
                </div>
                <select
                  value={assignments[index] || ''}
                  onChange={(e) => {
                    setAssignments(prev => ({ ...prev, [index]: e.target.value }));
                  }}
                  className="text-xs border border-slate-200 rounded-md px-2 py-1.5 min-w-[140px] focus:outline-none focus:border-blue-400"
                >
                  <option value="">担当者なし</option>
                  <option value="__self__">自分に割り当て</option>
                  {members.map(m => (
                    <option key={m.contact_id} value={m.contact_id}>
                      {m.display_name}
                    </option>
                  ))}
                </select>
              </div>
            ))
          )}
        </div>

        {/* フッター */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            キャンセル
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
            タスクを登録
          </button>
        </div>
      </div>
    </div>
  );
}
