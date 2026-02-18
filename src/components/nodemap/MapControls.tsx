'use client';

import type { MapViewMode, MapUser } from '@/lib/types';
import { cn } from '@/lib/utils';

interface MapControlsProps {
  viewMode: MapViewMode;
  selectedTaskId: string | null;
  selectedUserId: string;
  users: MapUser[];
  availableTasks: { id: string; label: string }[];
  isCompareMode: boolean;
  compareUserId: string | null;
  onViewModeChange: (mode: MapViewMode) => void;
  onTaskSelect: (taskId: string | null) => void;
  onUserSelect: (userId: string) => void;
  onCompareToggle: (userId: string | null) => void;
}

const VIEW_MODES: { key: MapViewMode; label: string; icon: string; description: string }[] = [
  { key: 'base', label: 'ベース', icon: '🗺️', description: '全ノード表示' },
  { key: 'ideation', label: '構想', icon: '💭', description: '構想時の認識範囲' },
  { key: 'path', label: '経路', icon: '🔗', description: '思考の経路を表示' },
  { key: 'result', label: '結果', icon: '🎯', description: '最終的な着地範囲' },
];

export default function MapControls({
  viewMode,
  selectedTaskId,
  selectedUserId,
  users,
  availableTasks,
  isCompareMode,
  compareUserId,
  onViewModeChange,
  onTaskSelect,
  onUserSelect,
  onCompareToggle,
}: MapControlsProps) {
  const currentUser = users.find((u) => u.id === selectedUserId);

  return (
    <div className="space-y-4">
      {/* ユーザー切替 */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-2">ユーザー</label>
        <div className="flex flex-wrap gap-2">
          {users.map((user) => (
            <button
              key={user.id}
              onClick={() => onUserSelect(user.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                selectedUserId === user.id
                  ? 'text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
              style={selectedUserId === user.id ? { backgroundColor: user.avatarColor } : {}}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: user.avatarColor }}
              />
              {user.displayName}
            </button>
          ))}
        </div>
      </div>

      {/* タスク選択 */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-2">タスク選択</label>
        <select
          value={selectedTaskId || ''}
          onChange={(e) => onTaskSelect(e.target.value || null)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">タスクを選択してください</option>
          {availableTasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.label}
            </option>
          ))}
        </select>
      </div>

      {/* 表示モード */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-2">表示モード</label>
        <div className="grid grid-cols-2 gap-2">
          {VIEW_MODES.map((mode) => (
            <button
              key={mode.key}
              onClick={() => onViewModeChange(mode.key)}
              disabled={mode.key !== 'base' && !selectedTaskId}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all text-left',
                viewMode === mode.key
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'bg-gray-50 text-gray-600 border border-gray-100 hover:bg-gray-100',
                mode.key !== 'base' && !selectedTaskId && 'opacity-40 cursor-not-allowed'
              )}
            >
              <span className="text-base">{mode.icon}</span>
              <div>
                <div>{mode.label}</div>
                <div className="text-[10px] text-gray-400">{mode.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 比較モード */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-2">比較モード</label>
        {!isCompareMode ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-400">比較相手を選択すると2人のマップを並列表示します</p>
            <div className="flex flex-wrap gap-2">
              {users
                .filter((u) => u.id !== selectedUserId)
                .map((user) => (
                  <button
                    key={user.id}
                    onClick={() => onCompareToggle(user.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-all"
                  >
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: user.avatarColor }}
                    />
                    {user.displayName}と比較
                  </button>
                ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between bg-purple-50 px-3 py-2 rounded-lg border border-purple-200">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: currentUser?.avatarColor }}
              />
              <span className="text-xs font-medium text-gray-700">{currentUser?.displayName}</span>
              <span className="text-xs text-gray-400">vs</span>
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: users.find((u) => u.id === compareUserId)?.avatarColor }}
              />
              <span className="text-xs font-medium text-gray-700">
                {users.find((u) => u.id === compareUserId)?.displayName}
              </span>
            </div>
            <button
              onClick={() => onCompareToggle(null)}
              className="text-xs text-purple-600 hover:text-purple-800 font-medium"
            >
              解除
            </button>
          </div>
        )}
      </div>

      {/* 凡例 */}
      <div className="border-t border-gray-100 pt-4">
        <label className="block text-xs font-semibold text-gray-500 mb-2">凡例</label>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <div className="w-3 h-3 rounded-full bg-gray-400" />
            <span>認知（受信のみ）</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span>理解（自分で使用）</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>習熟（他人に説明）</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 mt-2">
            <div className="w-3 h-3 rounded-full border-2 border-gray-300" />
            <span>キーワード</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <div className="w-3 h-3 rotate-45 bg-gray-400" />
            <span>人物</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <div className="w-3 h-3 rounded-sm bg-gray-400" />
            <span>プロジェクト</span>
          </div>
        </div>
      </div>
    </div>
  );
}
