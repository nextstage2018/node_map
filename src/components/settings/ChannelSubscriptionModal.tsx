// Phase 25: チャネル購読選択モーダル
'use client';

import { useState, useEffect, useCallback } from 'react';

interface ChannelItem {
  channel_id: string;
  channel_name: string;
  channel_type: string;
  is_subscribed: boolean;
  member_count?: number;
  purpose?: string;
}

interface ChannelSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  serviceName: 'gmail' | 'slack' | 'chatwork';
  serviceLabel: string;
  onSaved: () => void;
}

const SERVICE_ICONS: Record<string, string> = {
  gmail: '📧',
  slack: '💬',
  chatwork: '🔵',
};

const CHANNEL_TYPE_LABELS: Record<string, string> = {
  system_label: 'システムラベル',
  user_label: 'ユーザーラベル',
  public: 'パブリック',
  private: 'プライベート',
  dm: 'DM',
  group: 'グループ',
  my: 'マイチャット',
  room: 'ルーム',
};

const CHANNEL_TYPE_ICONS: Record<string, string> = {
  system_label: '🏷️',
  user_label: '📁',
  public: '#',
  private: '🔒',
  dm: '💬',
  group: '👥',
  my: '📝',
  room: '🏠',
};

export default function ChannelSubscriptionModal({
  isOpen,
  onClose,
  serviceName,
  serviceLabel,
  onSaved,
}: ChannelSubscriptionModalProps) {
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 利用可能チャネルを取得
  const loadChannels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/settings/channels/available?service=${serviceName}`);
      const data = await res.json();
      if (data.success) {
        setChannels(data.data || []);
        // 既に購読中のものを初期選択
        const subscribedIds = new Set<string>(
          (data.data || [])
            .filter((ch: ChannelItem) => ch.is_subscribed)
            .map((ch: ChannelItem) => ch.channel_id)
        );
        setSelectedIds(subscribedIds);
      } else {
        setError(data.error || 'チャネル一覧の取得に失敗しました');
      }
    } catch (e) {
      setError('チャネル一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [serviceName]);

  useEffect(() => {
    if (isOpen) {
      loadChannels();
      setSearchQuery('');
    }
  }, [isOpen, loadChannels]);

  // チャネル選択トグル
  const toggleChannel = (channelId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(channelId)) {
        next.delete(channelId);
      } else {
        next.add(channelId);
      }
      return next;
    });
  };

  // 全選択/全解除
  const toggleAll = () => {
    const filteredChannels = getFilteredChannels();
    const allSelected = filteredChannels.every((ch) => selectedIds.has(ch.channel_id));
    if (allSelected) {
      // 全解除
      const next = new Set(selectedIds);
      filteredChannels.forEach((ch) => next.delete(ch.channel_id));
      setSelectedIds(next);
    } else {
      // 全選択
      const next = new Set(selectedIds);
      filteredChannels.forEach((ch) => next.add(ch.channel_id));
      setSelectedIds(next);
    }
  };

  // 保存
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const selectedChannels = channels
        .filter((ch) => selectedIds.has(ch.channel_id))
        .map((ch) => ({
          channel_id: ch.channel_id,
          channel_name: ch.channel_name,
          channel_type: ch.channel_type,
          is_active: true,
        }));

      const res = await fetch('/api/settings/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceName,
          channels: selectedChannels,
        }),
      });

      const data = await res.json();
      if (data.success) {
        onSaved();
        onClose();
      } else {
        setError(data.error || '保存に失敗しました');
      }
    } catch (e) {
      setError('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // フィルタリング
  const getFilteredChannels = () => {
    if (!searchQuery.trim()) return channels;
    const q = searchQuery.toLowerCase();
    return channels.filter(
      (ch) =>
        ch.channel_name.toLowerCase().includes(q) ||
        ch.channel_type.toLowerCase().includes(q)
    );
  };

  // タイプ別にグルーピング
  const groupByType = (channelList: ChannelItem[]) => {
    const groups: Record<string, ChannelItem[]> = {};
    for (const ch of channelList) {
      const type = ch.channel_type || 'other';
      if (!groups[type]) groups[type] = [];
      groups[type].push(ch);
    }
    return groups;
  };

  if (!isOpen) return null;

  const filteredChannels = getFilteredChannels();
  const grouped = groupByType(filteredChannels);
  const allFilteredSelected = filteredChannels.length > 0 && filteredChannels.every((ch) => selectedIds.has(ch.channel_id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* ヘッダー */}
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{SERVICE_ICONS[serviceName]}</span>
            <h2 className="text-lg font-bold">{serviceLabel} - 取得対象チャネル</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* 説明 */}
        <div className="px-4 pt-3 pb-2">
          <p className="text-sm text-gray-600">
            メッセージを取得するチャネル/グループを選択してください。
            選択したチャネルのメッセージのみインボックスに表示されます。
          </p>
        </div>

        {/* 検索 + 全選択 */}
        <div className="px-4 py-2 flex gap-2 items-center">
          <input
            type="text"
            placeholder="チャネルを検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={toggleAll}
            className="px-3 py-1.5 text-xs text-blue-600 border border-blue-300 rounded hover:bg-blue-50 whitespace-nowrap"
          >
            {allFilteredSelected ? '全解除' : '全選択'}
          </button>
        </div>

        {/* チャネル一覧 */}
        <div className="flex-1 overflow-auto px-4 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
              <span className="ml-2 text-sm text-gray-500">読み込み中...</span>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-sm text-red-600">{error}</p>
              <button
                onClick={loadChannels}
                className="mt-2 text-sm text-blue-600 hover:underline"
              >
                再読み込み
              </button>
            </div>
          ) : channels.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">
              利用可能なチャネルがありません
            </div>
          ) : (
            Object.entries(grouped).map(([type, items]) => (
              <div key={type} className="mb-3">
                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <span>{CHANNEL_TYPE_ICONS[type] || '📂'}</span>
                  <span>{CHANNEL_TYPE_LABELS[type] || type}</span>
                  <span className="text-gray-300">({items.length})</span>
                </h3>
                <div className="space-y-1">
                  {items.map((ch) => (
                    <label
                      key={ch.channel_id}
                      className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
                        selectedIds.has(ch.channel_id)
                          ? 'bg-blue-50 border border-blue-200'
                          : 'hover:bg-gray-50 border border-transparent'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(ch.channel_id)}
                        onChange={() => toggleChannel(ch.channel_id)}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-800 truncate block">
                          {ch.channel_name}
                        </span>
                        {ch.purpose && (
                          <span className="text-xs text-gray-400 truncate block">
                            {ch.purpose}
                          </span>
                        )}
                      </div>
                      {ch.member_count !== undefined && ch.member_count > 0 && (
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {ch.member_count}人
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* フッター */}
        <div className="p-4 border-t flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {selectedIds.size} 件選択中
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border rounded hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存する'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
