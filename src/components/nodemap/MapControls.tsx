'use client';

import type { MapViewMode, MapUser, NodeFilterMode } from '@/lib/types';
import { cn } from '@/lib/utils';
import { KNOWLEDGE_DOMAIN_CONFIG, NODE_FILTER_CONFIG } from '@/lib/constants';

interface MapControlsProps {
  viewMode: MapViewMode;
  selectedTaskId: string | null;
  selectedUserId: string;
  users: MapUser[];
  availableTasks: { id: string; label: string }[];
  isCompareMode: boolean;
  compareUserId: string | null;
  selectedDomainId: string | null;
  filterMode: NodeFilterMode;
  onViewModeChange: (mode: MapViewMode) => void;
  onTaskSelect: (taskId: string | null) => void;
  onUserSelect: (userId: string) => void;
  onCompareToggle: (userId: string | null) => void;
  onDomainFilter: (domainId: string | null) => void;
  onFilterModeChange: (mode: NodeFilterMode) => void;
  onCheckpointRecord?: () => void;
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
  selectedDomainId,
  filterMode,
  onViewModeChange,
  onTaskSelect,
  onUserSelect,
  onCompareToggle,
  onDomainFilter,
  onFilterModeChange,
  onCheckpointRecord,
}: MapControlsProps) {
  const currentUser = users.find((u) => u.id === selectedUserId);

  return (
    <div className="space-y-4">
      {/* ユーザー切替 */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-2">ユーザー</label>
        <div className="flex flex-wrap gap-2">
          {users.map((user) => (
            <button
              key={user.id}
              onClick={() => onUserSelect(user.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                selectedUserId === user.id
                  ? 'text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
        <label className="block text-xs font-semibold text-slate-500 mb-2">タスク選択</label>
        <select
          value={selectedTaskId || ''}
          onChange={(e) => onTaskSelect(e.target.value || null)}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">タスクを選択してください</option>
          {availableTasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.label}
            </option>
          ))}
        </select>
        {/* チェックポイント記録ボタン（タスク選択時のみ） */}
        {selectedTaskId && onCheckpointRecord && (
          <button
            onClick={onCheckpointRecord}
            className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-all"
          >
            <span>📍</span>
            チェックポイント記録
          </button>
        )}
      </div>

      {/* 表示モード */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-2">表示モード</label>
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
                  : 'bg-slate-50 text-slate-600 border border-slate-100 hover:bg-slate-100',
                mode.key !== 'base' && !selectedTaskId && 'opacity-40 cursor-not-allowed'
              )}
            >
              <span className="text-base">{mode.icon}</span>
              <div>
                <div>{mode.label}</div>
                <div className="text-[10px] text-slate-400">{mode.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ノード表示フィルター（Phase 10） */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-2">ノード表示</label>
        <div className="flex flex-wrap gap-1.5">
          {(Object.entries(NODE_FILTER_CONFIG) as [NodeFilterMode, typeof NODE_FILTER_CONFIG[keyof typeof NODE_FILTER_CONFIG]][]).map(
            ([key, cfg]) => (
              <button
                key={key}
                onClick={() => onFilterModeChange(key)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium transition-all',
                  filterMode === key
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'bg-slate-50 text-slate-500 border border-slate-100 hover:bg-slate-100'
                )}
              >
                {cfg.label}
              </button>
            )
          )}
        </div>
      </div>

      {/* 比較モード */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-2">比較モード</label>
        {!isCompareMode ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">比較相手を選択すると2人のマップを並列表示します</p>
            <div className="flex flex-wrap gap-2">
              {users
                .filter((u) => u.id !== selectedUserId)
                .map((user) => (
                  <button
                    key={user.id}
                    onClick={() => onCompareToggle(user.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
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
              <span className="text-xs font-medium text-slate-700">{currentUser?.displayName}</span>
              <span className="text-xs text-slate-400">vs</span>
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: users.find((u) => u.id === compareUserId)?.avatarColor }}
              />
              <span className="text-xs font-medium text-slate-700">
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

      {/* 領域フィルター */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-2">領域フィルター</label>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => onDomainFilter(null)}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-medium transition-all',
              !selectedDomainId
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'bg-slate-50 text-slate-500 border border-slate-100 hover:bg-slate-100'
            )}
          >
            すべて
          </button>
          {Object.entries(KNOWLEDGE_DOMAIN_CONFIG).map(([id, cfg]) => (
            <button
              key={id}
              onClick={() => onDomainFilter(selectedDomainId === id ? null : id)}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all',
                selectedDomainId === id
                  ? 'border shadow-sm'
                  : 'bg-slate-50 text-slate-500 border border-slate-100 hover:bg-slate-100'
              )}
              style={selectedDomainId === id ? {
                backgroundColor: `${cfg.color}15`,
                color: cfg.color,
                borderColor: `${cfg.color}40`,
              } : {}}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: cfg.color }}
              />
              {cfg.name}
            </button>
          ))}
        </div>
      </div>

      {/* 凡例 */}
      <div className="border-t border-slate-100 pt-4">
        <label className="block text-xs font-semibold text-slate-500 mb-2">凡例</label>
        <div className="space-y-1.5">
          {/* 理解度 */}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="w-3 h-3 rounded-full bg-slate-400" />
            <span>認知（受信のみ）</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span>理解（自分で使用）</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>習熟（他人に説明）</span>
          </div>
          {/* ノード形状 */}
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
            <div className="w-3 h-3 rounded-full border-2 border-slate-300" />
            <span>キーワード</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="w-3 h-3 rotate-45 bg-slate-400" />
            <span>人物</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="w-3 h-3 rounded-sm bg-slate-400" />
            <span>プロジェクト</span>
          </div>
          {/* エッジタイプ（Phase 10） */}
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
            <div className="w-6 h-0 border-t-2 border-blue-500" />
            <span>本流（同分野）</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="w-6 h-0 border-t border-dashed border-slate-300" />
            <span>支流（異分野）</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="w-2 h-2 bg-amber-400" style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }} />
            <span>チェックポイント</span>
          </div>
        </div>
      </div>
    </div>
  );
}
