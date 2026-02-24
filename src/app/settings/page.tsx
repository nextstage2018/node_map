'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/shared/Header';

// Chatwork用のトークン入力フォーム設定（Gmail/SlackはOAuth）
const CHATWORK_FORM_CONFIG = {
  label: 'Chatwork',
  fields: [
    { key: 'api_token', label: 'APIトークン', type: 'password', placeholder: 'xxxxxxxxxxxxxxxx' },
    { key: 'account_name', label: 'アカウント名', type: 'text', placeholder: 'your_account' },
  ],
};

// チャンネル認証カード
function ChannelAuthCard({ channel, label, icon, isConnected, accountName, onAuth, onRevoke, authLabel }: {
  channel: string; label: string; icon: string; isConnected: boolean; accountName: string; onAuth: () => void; onRevoke: () => void; authLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <h3 className="font-medium">{label}</h3>
          {isConnected && <p className="text-sm text-gray-500">{accountName}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isConnected ? (
          <>
            <span className="text-sm text-green-600 font-medium">接続済み</span>
            <button onClick={onRevoke} className="px-3 py-1 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50">
              解除
            </button>
          </>
        ) : (
          <button onClick={onAuth} className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700">
            {authLabel || '接続する'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('channels');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showChatworkForm, setShowChatworkForm] = useState(false);
  const [chatworkFormData, setChatworkFormData] = useState<Record<string, string>>({});

  // チャンネル接続状態
  const [channels, setChannels] = useState<Record<string, { connected: boolean; accountName: string }>>({
    gmail: { connected: false, accountName: '' },
    slack: { connected: false, accountName: '' },
    chatwork: { connected: false, accountName: '' },
  });

  // プロフィール
  const [profile, setProfile] = useState({
    displayName: '',
    email: '',
    timezone: 'Asia/Tokyo',
    language: 'ja',
  });

  // 通知設定
  const [notifications, setNotifications] = useState({
    emailNotification: true,
    desktopNotification: true,
    mentionOnly: false,
    digestFrequency: 'realtime' as string,
  });

  // トークン読み込み
  const loadTokens = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/tokens');
      const data = await res.json();
      if (data.success && data.data) {
        const newChannels: Record<string, { connected: boolean; accountName: string }> = {
          gmail: { connected: false, accountName: '' },
          slack: { connected: false, accountName: '' },
          chatwork: { connected: false, accountName: '' },
        };
        for (const token of data.data) {
          const serviceName = token.service_name;
          if (newChannels[serviceName]) {
            newChannels[serviceName] = {
              connected: token.is_active,
              accountName: token.token_data?.email || token.token_data?.team_name || token.token_data?.account_name || '接続済み',
            };
          }
        }
        setChannels(newChannels);
      }
    } catch (e) {
      console.error('トークン読み込みエラー:', e);
    }
  }, []);

  // プロフィール読み込み
  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/profile');
      const data = await res.json();
      if (data.success && data.data) {
        setProfile(data.data);
      }
    } catch (e) {
      console.error('プロフィール読み込みエラー:', e);
    }
  }, []);

  useEffect(() => {
    loadTokens();
    loadProfile();
  }, [loadTokens, loadProfile]);

  // OAuth認証コールバック結果チェック
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authResult = params.get('auth');
    const service = params.get('service');
    if (authResult === 'success' && service) {
      setMessage({ type: 'success', text: `${service} を連携しました！` });
      loadTokens();
      // URLパラメータをクリーンアップ
      window.history.replaceState({}, '', '/settings');
    } else if (authResult === 'error') {
      setMessage({ type: 'error', text: `${service || 'サービス'} の連携に失敗しました` });
      window.history.replaceState({}, '', '/settings');
    }
  }, [loadTokens]);

  // Gmail OAuth開始（リダイレクト）
  const handleGmailAuth = () => {
    window.location.href = '/api/auth/gmail';
  };

  // Slack OAuth開始（リダイレクト）
  const handleSlackAuth = () => {
    window.location.href = '/api/auth/slack';
  };

  // Chatwork手動トークン保存
  const handleChatworkAuth = async () => {
    if (!showChatworkForm) {
      setShowChatworkForm(true);
      setChatworkFormData({});
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceName: 'chatwork',
          tokenData: chatworkFormData,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Chatwork を接続しました' });
        setShowChatworkForm(false);
        setChatworkFormData({});
        loadTokens();
      } else {
        setMessage({ type: 'error', text: data.error || '接続に失敗しました' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: '接続に失敗しました' });
    } finally {
      setLoading(false);
    }
  };

  // チャンネル認証解除
  const handleRevoke = async (serviceName: string) => {
    const labels: Record<string, string> = { gmail: 'Gmail', slack: 'Slack', chatwork: 'Chatwork' };
    if (!confirm(labels[serviceName] + ' の接続を解除しますか？')) return;
    setLoading(true);
    try {
      const res = await fetch('/api/settings/tokens?serviceName=' + serviceName, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: '接続を解除しました' });
        loadTokens();
      } else {
        setMessage({ type: 'error', text: data.error || '解除に失敗しました' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: '解除に失敗しました' });
    } finally {
      setLoading(false);
    }
  };

  // プロフィール保存
  const handleSaveProfile = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'プロフィールを保存しました' });
      } else {
        setMessage({ type: 'error', text: data.error || '保存に失敗しました' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: '保存に失敗しました' });
    } finally {
      setLoading(false);
    }
  };

  // 通知設定保存
  const handleSaveNotifications = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifications }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: '通知設定を保存しました' });
      } else {
        setMessage({ type: 'error', text: data.error || '保存に失敗しました' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: '保存に失敗しました' });
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'channels', label: 'チャンネル接続' },
    { id: 'profile', label: 'プロフィール' },
    { id: 'notifications', label: '通知設定' },
  ];

  return (
    <div className="flex flex-col h-screen bg-white">
      <Header />
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6">
          <h1 className="text-2xl font-bold mb-6">個人設定</h1>

          {message && (
            <div className={`mb-4 p-3 rounded ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {message.text}
            </div>
          )}

          {/* タブ */}
          <div className="flex border-b mb-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium ${activeTab === tab.id ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* チャンネル接続タブ */}
          {activeTab === 'channels' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 mb-4">
                Gmail・Slackはボタンを押すだけで連携できます。ChatworkはAPIトークンを入力してください。
              </p>

              {/* Gmail（OAuth） */}
              <ChannelAuthCard
                channel="gmail"
                label="Gmail"
                icon="📧"
                isConnected={channels.gmail.connected}
                accountName={channels.gmail.accountName}
                onAuth={handleGmailAuth}
                onRevoke={() => handleRevoke('gmail')}
                authLabel="Googleアカウントで連携"
              />

              {/* Slack（OAuth） */}
              <ChannelAuthCard
                channel="slack"
                label="Slack"
                icon="💬"
                isConnected={channels.slack.connected}
                accountName={channels.slack.accountName}
                onAuth={handleSlackAuth}
                onRevoke={() => handleRevoke('slack')}
                authLabel="Slackワークスペースで連携"
              />

              {/* Chatwork（手動トークン入力） */}
              <div>
                <ChannelAuthCard
                  channel="chatwork"
                  label="Chatwork"
                  icon="🔵"
                  isConnected={channels.chatwork.connected}
                  accountName={channels.chatwork.accountName}
                  onAuth={handleChatworkAuth}
                  onRevoke={() => handleRevoke('chatwork')}
                  authLabel="APIトークンで接続"
                />
                {showChatworkForm && !channels.chatwork.connected && (
                  <div className="mt-2 ml-12 p-4 bg-gray-50 rounded-lg border">
                    <h4 className="text-sm font-medium mb-3">Chatwork の認証情報</h4>
                    {CHATWORK_FORM_CONFIG.fields.map((field) => (
                      <div key={field.key} className="mb-3">
                        <label className="block text-xs text-gray-600 mb-1">{field.label}</label>
                        <input
                          type={field.type}
                          placeholder={field.placeholder}
                          value={chatworkFormData[field.key] || ''}
                          onChange={(e) => setChatworkFormData({ ...chatworkFormData, [field.key]: e.target.value })}
                          className="w-full px-3 py-2 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    ))}
                    <p className="text-xs text-gray-400 mb-3">
                      APIトークンは Chatwork &gt; 動作設定 &gt; API設定 から取得できます
                    </p>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={handleChatworkAuth}
                        disabled={loading}
                        className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {loading ? '接続中...' : '保存して接続'}
                      </button>
                      <button
                        onClick={() => { setShowChatworkForm(false); setChatworkFormData({}); }}
                        className="px-4 py-2 text-sm text-gray-600 border rounded hover:bg-gray-50"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* プロフィールタブ */}
          {activeTab === 'profile' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">表示名</label>
                <input
                  type="text"
                  value={profile.displayName}
                  onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
                <input
                  type="email"
                  value={profile.email}
                  disabled
                  className="w-full px-3 py-2 border rounded bg-gray-100 text-gray-500"
                />
                <p className="text-xs text-gray-400 mt-1">メールアドレスはログイン情報から取得されます</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">タイムゾーン</label>
                <select
                  value={profile.timezone}
                  onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York (EST)</option>
                  <option value="Europe/London">Europe/London (GMT)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">言語</label>
                <select
                  value={profile.language}
                  onChange={(e) => setProfile({ ...profile, language: e.target.value })}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ja">日本語</option>
                  <option value="en">English</option>
                </select>
              </div>
              <button
                onClick={handleSaveProfile}
                disabled={loading}
                className="px-6 py-2 text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? '保存中...' : 'プロフィールを保存'}
              </button>
            </div>
          )}

          {/* 通知設定タブ */}
          {activeTab === 'notifications' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 border rounded">
                <div>
                  <h3 className="font-medium">メール通知</h3>
                  <p className="text-sm text-gray-500">新着メッセージをメールで通知</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={notifications.emailNotification} onChange={(e) => setNotifications({ ...notifications, emailNotification: e.target.checked })} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>
              <div className="flex items-center justify-between p-3 border rounded">
                <div>
                  <h3 className="font-medium">デスクトップ通知</h3>
                  <p className="text-sm text-gray-500">ブラウザのプッシュ通知</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={notifications.desktopNotification} onChange={(e) => setNotifications({ ...notifications, desktopNotification: e.target.checked })} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>
              <div className="flex items-center justify-between p-3 border rounded">
                <div>
                  <h3 className="font-medium">メンションのみ</h3>
                  <p className="text-sm text-gray-500">自分宛てのメンションのみ通知</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={notifications.mentionOnly} onChange={(e) => setNotifications({ ...notifications, mentionOnly: e.target.checked })} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">通知頻度</label>
                <select
                  value={notifications.digestFrequency}
                  onChange={(e) => setNotifications({ ...notifications, digestFrequency: e.target.value })}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="realtime">リアルタイム</option>
                  <option value="hourly">1時間ごと</option>
                  <option value="daily">1日1回</option>
                </select>
              </div>
              <button
                onClick={handleSaveNotifications}
                disabled={loading}
                className="px-6 py-2 text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? '保存中...' : '通知設定を保存'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
