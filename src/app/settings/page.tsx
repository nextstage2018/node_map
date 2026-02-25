// Phase 25: 設定画面 — チャネル購読設定を追加
'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/shared/Header';
import ChannelSubscriptionModal from '@/components/settings/ChannelSubscriptionModal';
import SetupWizard from '@/components/setup/SetupWizard';

// Chatwork用のトークン入力フォーム設定（Gmail/SlackはOAuth）
const CHATWORK_FORM_CONFIG = {
  label: 'Chatwork',
  fields: [
    { key: 'api_token', label: 'APIトークン', type: 'password', placeholder: 'xxxxxxxxxxxxxxxx' },
    { key: 'account_name', label: 'アカウント名', type: 'text', placeholder: 'your_account' },
  ],
};

// チャンネル認証カード
function ChannelAuthCard({ channel, label, icon, isConnected, accountName, onAuth, onRevoke, authLabel, onConfigureChannels, subscriptionCount }: {
  channel: string; label: string; icon: string; isConnected: boolean; accountName: string; onAuth: () => void; onRevoke: () => void; authLabel?: string;
  onConfigureChannels?: () => void; subscriptionCount?: number;
}) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-4">
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

      {/* Phase 25: 接続済みサービスにチャネル設定ボタンを表示 */}
      {isConnected && onConfigureChannels && (
        <div className="px-4 pb-3 pt-0">
          <button
            onClick={onConfigureChannels}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-blue-600 border border-blue-200 rounded hover:bg-blue-50 transition-colors"
          >
            <span>📋</span>
            <span>取得対象チャネル設定</span>
            {subscriptionCount !== undefined && subscriptionCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                {subscriptionCount}件
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('channels');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showChatworkForm, setShowChatworkForm] = useState(false);
  const [chatworkFormData, setChatworkFormData] = useState<Record<string, string>>({});

  // Phase 30b: セットアップウィザード
  const [showSetupWizard, setShowSetupWizard] = useState(false);

  // Phase 25: チャネル購読モーダル
  const [channelModal, setChannelModal] = useState<{
    isOpen: boolean;
    service: 'gmail' | 'slack' | 'chatwork';
    label: string;
  }>({ isOpen: false, service: 'gmail', label: '' });

  // Phase 25: 各サービスの購読数
  const [subscriptionCounts, setSubscriptionCounts] = useState<Record<string, number>>({
    gmail: 0,
    slack: 0,
    chatwork: 0,
  });

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

  // Phase 25: 購読数を読み込み
  const loadSubscriptionCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/channels');
      const data = await res.json();
      if (data.success && data.data) {
        const counts: Record<string, number> = { gmail: 0, slack: 0, chatwork: 0 };
        for (const sub of data.data) {
          if (sub.is_active && counts[sub.service_name] !== undefined) {
            counts[sub.service_name]++;
          }
        }
        setSubscriptionCounts(counts);
      }
    } catch (e) {
      console.error('購読数読み込みエラー:', e);
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
    loadSubscriptionCounts();
  }, [loadTokens, loadProfile, loadSubscriptionCounts]);

  // OAuth認証コールバック結果チェック
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authResult = params.get('auth');
    const service = params.get('service');
    const errorParam = params.get('error');
    const successParam = params.get('success');

    if (authResult === 'success' && service) {
      setMessage({ type: 'success', text: `${service} を連携しました！` });
      loadTokens();
      window.history.replaceState({}, '', '/settings');
    } else if (successParam) {
      setMessage({ type: 'success', text: `${successParam} 連携完了！` });
      loadTokens();
      window.history.replaceState({}, '', '/settings');
    } else if (errorParam) {
      const errorMessages: Record<string, string> = {
        gmail_denied: 'Gmailの認証が拒否されました',
        gmail_invalid: 'Gmailの認証パラメータが不正です',
        gmail_not_configured: 'Gmail OAuth設定が未完了です',
        gmail_token_failed: 'Gmailのトークン取得に失敗しました（リダイレクトURIの不一致の可能性）',
        gmail_save_failed: 'Gmailトークンのデータベース保存に失敗しました',
        gmail_callback_failed: 'Gmailの認証コールバックでエラーが発生しました',
        slack_denied: 'Slackの認証が拒否されました',
        slack_token_failed: 'Slackのトークン取得に失敗しました',
        slack_save_failed: 'Slackトークンのデータベース保存に失敗しました',
      };
      const detail = params.get('detail');
      const baseMsg = errorMessages[errorParam] || `認証エラー: ${errorParam}`;
      setMessage({ type: 'error', text: detail ? `${baseMsg}（詳細: ${detail}）` : baseMsg });
      window.history.replaceState({}, '', '/settings');
    }
  }, [loadTokens]);

  // Gmail OAuth開始
  const handleGmailAuth = () => {
    window.location.href = '/api/auth/gmail';
  };

  // Slack OAuth開始
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
        // Phase 25: 接続解除時に購読も削除
        await fetch(`/api/settings/channels?service=${serviceName}`, { method: 'DELETE' });
        loadSubscriptionCounts();
      } else {
        setMessage({ type: 'error', text: data.error || '解除に失敗しました' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: '解除に失敗しました' });
    } finally {
      setLoading(false);
    }
  };

  // Phase 25: チャネル設定モーダルを開く
  const openChannelModal = (service: 'gmail' | 'slack' | 'chatwork', label: string) => {
    setChannelModal({ isOpen: true, service, label });
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
    { id: 'setup', label: '初回セットアップ' },
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
                接続後、「取得対象チャネル設定」で取得するチャネルを選択できます。
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
                onConfigureChannels={() => openChannelModal('gmail', 'Gmail')}
                subscriptionCount={subscriptionCounts.gmail}
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
                onConfigureChannels={() => openChannelModal('slack', 'Slack')}
                subscriptionCount={subscriptionCounts.slack}
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
                  onConfigureChannels={() => openChannelModal('chatwork', 'Chatwork')}
                  subscriptionCount={subscriptionCounts.chatwork}
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

              {/* Phase 25: データ取得ルール説明 */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h3 className="text-sm font-medium text-gray-700 mb-2">データ取得ルール</h3>
                <ul className="text-xs text-gray-500 space-y-1">
                  <li>・初回接続時は過去30日分のメッセージを取得します</li>
                  <li>・2回目以降は前回取得以降の新着メッセージのみ取得します</li>
                  <li>・チャネルが未選択の場合、そのサービスのメッセージは取得されません</li>
                </ul>
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

          {/* Phase 30b: 初回セットアップタブ */}
          {activeTab === 'setup' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 mb-4">
                自社の情報、チームメンバー、プロジェクトを一括で登録できます。
                初めてNodeMapを使う方はこちらからセットアップを開始してください。
              </p>
              <button
                onClick={() => setShowSetupWizard(true)}
                className="px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                初回セットアップを開始
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Phase 25: チャネル購読モーダル */}
      <ChannelSubscriptionModal
        isOpen={channelModal.isOpen}
        onClose={() => setChannelModal({ ...channelModal, isOpen: false })}
        serviceName={channelModal.service}
        serviceLabel={channelModal.label}
        onSaved={() => {
          loadSubscriptionCounts();
          setMessage({ type: 'success', text: '取得対象チャネルを更新しました' });
        }}
      />

      {/* Phase 30b: セットアップウィザード */}
      <SetupWizard
        isOpen={showSetupWizard}
        onClose={() => setShowSetupWizard(false)}
        onCompleted={() => {
          setMessage({ type: 'success', text: '初回セットアップが完了しました！' });
        }}
      />
    </div>
  );
}
