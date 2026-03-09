// v3.3: プロジェクトチャネル管理コンポーネント
// 1メディア=1チャネル推奨。project_channels テーブル使用
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Link2, Plus, Search, X, Trash2, Hash, MessageSquare, Mail, AlertCircle,
} from 'lucide-react';

interface ProjectChannel {
  id: string;
  service_name: string;
  channel_identifier: string;
  channel_label: string | null;
  created_at: string;
}

interface AvailableChannel {
  channel_id: string;
  channel_name: string;
  channel_type: string;
  member_count?: number;
  is_subscribed: boolean;
}

interface Props {
  projectId: string;
  projectName: string;
}

function ServiceIcon({ service }: { service: string }) {
  switch (service) {
    case 'slack': return <Hash className="w-4 h-4 text-purple-600" />;
    case 'chatwork': return <MessageSquare className="w-4 h-4 text-green-600" />;
    case 'email': return <Mail className="w-4 h-4 text-blue-600" />;
    default: return <Link2 className="w-4 h-4 text-slate-400" />;
  }
}

function ServiceBadge({ service }: { service: string }) {
  const config: Record<string, { label: string; bg: string; text: string }> = {
    slack: { label: 'Slack', bg: 'bg-purple-50', text: 'text-purple-700' },
    chatwork: { label: 'Chatwork', bg: 'bg-green-50', text: 'text-green-700' },
    email: { label: 'Email', bg: 'bg-blue-50', text: 'text-blue-700' },
  };
  const c = config[service] || { label: service, bg: 'bg-slate-50', text: 'text-slate-700' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${c.bg} ${c.text}`}>
      <ServiceIcon service={service} />
      {c.label}
    </span>
  );
}

export default function ProjectChannels({ projectId, projectName }: Props) {
  const [channels, setChannels] = useState<ProjectChannel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedService, setSelectedService] = useState<'slack' | 'chatwork' | 'email'>('slack');
  const [availableChannels, setAvailableChannels] = useState<AvailableChannel[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [emailDomain, setEmailDomain] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const fetchChannels = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/channels`);
      const data = await res.json();
      if (data.success) setChannels(data.data || []);
    } catch { /* */ }
    setIsLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const fetchAvailable = async (service: string) => {
    setLoadingAvailable(true);
    try {
      const res = await fetch(`/api/settings/channels/available?service=${service}`);
      const data = await res.json();
      if (data.success) {
        // 既に紐づけ済みのチャネルを除外
        const linkedIds = new Set(
          channels.filter(c => c.service_name === service).map(c => c.channel_identifier)
        );
        setAvailableChannels(
          (data.data || []).filter((ch: AvailableChannel) => !linkedIds.has(ch.channel_id))
        );
      }
    } catch { /* */ }
    setLoadingAvailable(false);
  };

  useEffect(() => {
    if (showAddForm && selectedService !== 'email') {
      fetchAvailable(selectedService);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddForm, selectedService]);

  const addChannel = async (channelId: string, channelName: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceName: selectedService,
          channelIdentifier: channelId,
          channelLabel: channelName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg('success', `${channelName} を追加しました`);
        fetchChannels();
        setAvailableChannels(prev => prev.filter(c => c.channel_id !== channelId));
      } else {
        showMsg('error', data.error || '追加に失敗しました');
      }
    } catch {
      showMsg('error', '通信エラー');
    }
  };

  const addEmailDomain = async () => {
    const domain = emailDomain.trim().replace(/^@/, '');
    if (!domain) return;
    await addChannel(`@${domain}`, `@${domain}`);
    setEmailDomain('');
  };

  const removeChannel = async (channelDbId: string) => {
    if (!confirm('このチャネルの紐づけを解除しますか？')) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/channels?channelId=${channelDbId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showMsg('success', 'チャネルを解除しました');
        fetchChannels();
      }
    } catch {
      showMsg('error', '通信エラー');
    }
  };

  // 1メディア=1チャネルチェック
  const channelCountByService = channels.reduce((acc, ch) => {
    acc[ch.service_name] = (acc[ch.service_name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const hasMultipleWarning = Object.values(channelCountByService).some(count => count > 1);

  const filteredAvailable = availableChannels.filter(ch =>
    ch.channel_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center py-16">
        <div className="animate-spin text-2xl">&#8987;</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-800">{projectName} - チャネル</h2>
        <button
          onClick={() => { setShowAddForm(!showAddForm); setSearchQuery(''); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />追加
        </button>
      </div>

      {message && (
        <div className={`px-3 py-2 rounded-lg text-xs font-medium ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>{message.text}</div>
      )}

      {/* 推奨構成ガイド */}
      <div className="px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-xs font-medium text-blue-800 mb-1">推奨構成（1メディア = 1チャネル）</p>
        <div className="flex flex-wrap gap-2 text-[11px] text-blue-700">
          <span className="flex items-center gap-1"><Hash className="w-3 h-3 text-purple-500" />Slack: 1チャネル</span>
          <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3 text-green-500" />Chatwork: 1ルーム</span>
          <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-blue-500" />メール: 任意（現在休眠中）</span>
        </div>
      </div>

      {hasMultipleWarning && (
        <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            同一メディアに複数チャネルが紐づいています。1メディア=1チャネルを推奨します。
          </p>
        </div>
      )}

      {showAddForm && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">チャネルを追加</h3>
            <button onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex gap-2 mb-3">
            {(['slack', 'chatwork', 'email'] as const).map(svc => (
              <button
                key={svc}
                onClick={() => { setSelectedService(svc); setSearchQuery(''); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  selectedService === svc
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <ServiceIcon service={svc} />
                {svc === 'slack' ? 'Slack' : svc === 'chatwork' ? 'Chatwork' : 'Email'}
                {channelCountByService[svc] ? (
                  <span className="ml-1 text-[9px] px-1 py-0.5 rounded-full bg-white/30">{channelCountByService[svc]}</span>
                ) : null}
              </button>
            ))}
          </div>

          {selectedService === 'email' ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={emailDomain}
                onChange={(e) => setEmailDomain(e.target.value)}
                placeholder="例: example.co.jp"
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={addEmailDomain}
                disabled={!emailDomain.trim()}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >追加</button>
            </div>
          ) : (
            <>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="チャネルを検索..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {loadingAvailable ? (
                  <p className="text-xs text-slate-400 text-center py-4">読み込み中...</p>
                ) : filteredAvailable.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">利用可能なチャネルがありません</p>
                ) : filteredAvailable.map(ch => (
                  <div key={ch.channel_id} className="flex items-center justify-between p-2 rounded-lg hover:bg-white transition-colors">
                    <div className="flex items-center gap-2">
                      <ServiceIcon service={selectedService} />
                      <span className="text-sm text-slate-700">{ch.channel_name}</span>
                      {ch.member_count !== undefined && <span className="text-[10px] text-slate-400">{ch.member_count}人</span>}
                    </div>
                    <button
                      onClick={() => addChannel(ch.channel_id, ch.channel_name)}
                      className="px-2 py-1 text-[10px] font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                    >追加</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {channels.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-slate-400">
          <div className="text-center">
            <Link2 className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs">チャネルが紐づけられていません</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {channels.map(ch => (
            <div key={ch.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg">
              <div className="flex items-center gap-3">
                <ServiceBadge service={ch.service_name} />
                <span className="text-sm font-medium text-slate-700">{ch.channel_label || ch.channel_identifier}</span>
              </div>
              <button
                onClick={() => removeChannel(ch.id)}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="解除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
