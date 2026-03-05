// Phase 25 + Phase 60: 設定画面 — 機能説明 + Google連携名称 + プロフィール拡充
'use client';

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/shared/AppLayout';
import ContextBar from '@/components/shared/ContextBar';
import ChannelSubscriptionModal from '@/components/settings/ChannelSubscriptionModal';
import SetupWizard from '@/components/setup/SetupWizard';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/EmptyState';
import ProjectTypeManager from '@/components/settings/ProjectTypeManager';

// ========================================
// 🔰 機能ガイドコンポーネント
// ========================================
function FeatureGuide({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
      <div className="flex items-start gap-2">
        <span className="text-lg shrink-0">🔰</span>
        <div className="text-sm text-slate-700 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

// Chatwork用のトークン入力フォーム設定（Gmail/SlackはOAuth）
const CHATWORK_FORM_CONFIG = {
  label: 'Chatwork',
  fields: [
    { key: 'api_token', label: 'APIトークン', type: 'password', placeholder: 'xxxxxxxxxxxxxxxx' },
    { key: 'account_name', label: 'アカウント名', type: 'text', placeholder: 'your_account' },
  ],
};

// 16personalities タイプ一覧
const PERSONALITY_TYPES = [
  { value: '', label: '未設定' },
  { value: 'INTJ', label: 'INTJ（建築家）' },
  { value: 'INTP', label: 'INTP（論理学者）' },
  { value: 'ENTJ', label: 'ENTJ（指揮官）' },
  { value: 'ENTP', label: 'ENTP（討論者）' },
  { value: 'INFJ', label: 'INFJ（提唱者）' },
  { value: 'INFP', label: 'INFP（仲介者）' },
  { value: 'ENFJ', label: 'ENFJ（主人公）' },
  { value: 'ENFP', label: 'ENFP（運動家）' },
  { value: 'ISTJ', label: 'ISTJ（管理者）' },
  { value: 'ISFJ', label: 'ISFJ（擁護者）' },
  { value: 'ESTJ', label: 'ESTJ（幹部）' },
  { value: 'ESFJ', label: 'ESFJ（領事）' },
  { value: 'ISTP', label: 'ISTP（巨匠）' },
  { value: 'ISFP', label: 'ISFP（冒険家）' },
  { value: 'ESTP', label: 'ESTP（起業家）' },
  { value: 'ESFP', label: 'ESFP（エンターテイナー）' },
];

// AI応答スタイル
const AI_RESPONSE_STYLES = [
  { value: 'concise', label: '端的重視', description: '結論ファースト。要点のみ簡潔に回答' },
  { value: 'normal', label: '通常', description: 'バランスの取れた応答' },
  { value: 'detailed', label: '補足説明重視', description: '背景や理由も丁寧に説明' },
];

// チャンネル認証カード
function ChannelAuthCard({ channel, label, icon, isConnected, accountName, onAuth, onRevoke, authLabel, onConfigureChannels, subscriptionCount }: {
  channel: string; label: string; icon: string; isConnected: boolean; accountName: string; onAuth: () => void; onRevoke: () => void; authLabel?: string;
  onConfigureChannels?: () => void; subscriptionCount?: number;
}) {
  return (
    <Card variant="outlined" padding="md">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <div>
            <h3 className="font-medium text-slate-900">{label}</h3>
            {isConnected && <p className="text-sm text-slate-500">{accountName}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <span className="text-sm text-green-600 font-medium">接続済み</span>
              <Button onClick={onRevoke} variant="danger" size="sm">
                解除
              </Button>
            </>
          ) : (
            <Button onClick={onAuth} variant="primary" size="sm">
              {authLabel || '接続する'}
            </Button>
          )}
        </div>
      </div>

      {/* Phase 25: 接続済みサービスにチャネル設定ボタンを表示 */}
      {isConnected && onConfigureChannels && (
        <Button
          onClick={onConfigureChannels}
          variant="outline"
          size="sm"
          className="w-full justify-start"
          icon="📋"
        >
          <span>取得対象チャネル設定</span>
          {subscriptionCount !== undefined && subscriptionCount > 0 && (
            <span className="ml-auto px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
              {subscriptionCount}件
            </span>
          )}
        </Button>
      )}
    </Card>
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
  const [hasOwnOrg, setHasOwnOrg] = useState<boolean | null>(null);

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
  const [channels, setChannels] = useState<Record<string, { connected: boolean; accountName: string; hasCalendarScope?: boolean; hasDriveScope?: boolean }>>({
    gmail: { connected: false, accountName: '', hasCalendarScope: false, hasDriveScope: false },
    slack: { connected: false, accountName: '' },
    chatwork: { connected: false, accountName: '' },
  });

  // プロフィール
  const [profile, setProfile] = useState({
    displayName: '',
    email: '',
    timezone: 'Asia/Tokyo',
    language: 'ja',
    emailSignature: '',
    personalityType: '',
    aiResponseStyle: 'normal',
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
        const newChannels: Record<string, { connected: boolean; accountName: string; hasCalendarScope?: boolean; hasDriveScope?: boolean }> = {
          gmail: { connected: false, accountName: '', hasCalendarScope: false, hasDriveScope: false },
          slack: { connected: false, accountName: '' },
          chatwork: { connected: false, accountName: '' },
        };
        for (const token of data.data) {
          const serviceName = token.service_name;
          if (newChannels[serviceName]) {
            const scope = token.token_data?.scope || '';
            newChannels[serviceName] = {
              connected: token.is_active,
              accountName: token.token_data?.email || token.token_data?.team_name || token.token_data?.account_name || '接続済み',
              ...(serviceName === 'gmail' ? {
                hasCalendarScope: scope.includes('calendar'),
                hasDriveScope: scope.includes('drive'),
              } : {}),
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
        setProfile({
          displayName: data.data.displayName || '',
          email: data.data.email || '',
          timezone: data.data.timezone || 'Asia/Tokyo',
          language: data.data.language || 'ja',
          emailSignature: data.data.emailSignature || '',
          personalityType: data.data.personalityType || '',
          aiResponseStyle: data.data.aiResponseStyle || 'normal',
        });
      }
    } catch (e) {
      console.error('プロフィール読み込みエラー:', e);
    }
  }, []);

  // 自社組織の存在チェック
  const checkOwnOrg = useCallback(async () => {
    try {
      const res = await fetch('/api/organizations');
      const data = await res.json();
      if (data.success && data.data?.length > 0) {
        const hasInternal = data.data.some(
          (org: { relationship_type?: string }) => org.relationship_type === 'internal'
        );
        setHasOwnOrg(hasInternal || data.data.length > 0);
      } else {
        setHasOwnOrg(false);
      }
    } catch {
      setHasOwnOrg(false);
    }
  }, []);

  useEffect(() => {
    loadTokens();
    loadProfile();
    loadSubscriptionCounts();
    checkOwnOrg();
  }, [loadTokens, loadProfile, loadSubscriptionCounts, checkOwnOrg]);

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
        gmail_denied: 'Google認証が拒否されました',
        gmail_invalid: 'Google認証パラメータが不正です',
        gmail_not_configured: 'Google OAuth設定が未完了です',
        gmail_token_failed: 'Googleのトークン取得に失敗しました（リダイレクトURIの不一致の可能性）',
        gmail_save_failed: 'Googleトークンのデータベース保存に失敗しました',
        gmail_callback_failed: 'Google認証コールバックでエラーが発生しました',
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
    const labels: Record<string, string> = { gmail: 'Google連携', slack: 'Slack', chatwork: 'Chatwork' };
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
    { id: 'project-types', label: 'プロジェクト種別' },
    { id: 'profile', label: 'プロフィール' },
    { id: 'notifications', label: '通知設定' },
    // 自社組織が未登録の場合のみセットアップタブを表示
    ...(!hasOwnOrg ? [{ id: 'setup', label: '初回セットアップ' }] : []),
  ];

  return (
    <AppLayout>
      <ContextBar title="設定" />
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6">
          <h1 className="text-2xl font-bold mb-6">個人設定</h1>

          {message && (
            <Card variant="flat" padding="md" className={`mb-6 ${message.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <p className={message.type === 'success' ? 'text-green-700' : 'text-red-700'}>
                {message.text}
              </p>
            </Card>
          )}

          {/* タブ */}
          <div className="flex border-b border-slate-200 mb-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-600 hover:text-slate-700'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ============================================ */}
          {/* チャンネル接続タブ */}
          {/* ============================================ */}
          {activeTab === 'channels' && (
            <div className="space-y-6">
              <FeatureGuide>
                <p className="font-medium mb-1">チャンネル接続</p>
                <p>Gmail・Slack・Chatworkを連携すると、各サービスのメッセージがインボックスに表示されます。
                Google連携ではメール・カレンダー・Driveを一括で利用できます。
                接続後、「取得対象チャネル設定」で表示するチャネルを絞り込めます（未設定の場合は全メッセージを表示）。</p>
              </FeatureGuide>

              {/* Google連携（OAuth） — Gmail / Calendar / Drive */}
              <ChannelAuthCard
                channel="gmail"
                label="Google連携"
                icon="🔗"
                isConnected={channels.gmail.connected}
                accountName={channels.gmail.accountName}
                onAuth={handleGmailAuth}
                onRevoke={() => handleRevoke('gmail')}
                authLabel="Googleアカウントで連携"
                onConfigureChannels={() => openChannelModal('gmail', 'Gmail')}
                subscriptionCount={subscriptionCounts.gmail}
              />

              {/* Google連携の機能一覧（接続済みの場合） */}
              {channels.gmail.connected && (
                <Card variant="flat" padding="md" className="bg-slate-50 border border-slate-200 -mt-2">
                  <p className="text-xs font-medium text-slate-600 mb-2">Google連携で利用できる機能</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded ${channels.gmail.connected ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
                      <span>📧</span> <span>メール</span> <span className="ml-auto">✓</span>
                    </div>
                    <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded ${channels.gmail.hasCalendarScope ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                      <span>📅</span> <span>カレンダー</span> <span className="ml-auto">{channels.gmail.hasCalendarScope ? '✓' : '要再連携'}</span>
                    </div>
                    <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded ${channels.gmail.hasDriveScope ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                      <span>📁</span> <span>Drive</span> <span className="ml-auto">{channels.gmail.hasDriveScope ? '✓' : '要再連携'}</span>
                    </div>
                  </div>
                  {(!channels.gmail.hasCalendarScope || !channels.gmail.hasDriveScope) && (
                    <div className="mt-3">
                      <Button onClick={handleGmailAuth} variant="primary" size="sm">
                        不足している権限を追加して再連携
                      </Button>
                    </div>
                  )}
                </Card>
              )}

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
                  <Card variant="flat" padding="md" className="mt-4 bg-slate-50 border border-slate-200">
                    <h4 className="text-sm font-medium text-slate-900 mb-4">Chatwork の認証情報</h4>
                    <div className="space-y-3 mb-4">
                      {CHATWORK_FORM_CONFIG.fields.map((field) => (
                        <div key={field.key}>
                          <label className="block text-xs font-medium text-slate-700 mb-1.5">{field.label}</label>
                          <input
                            type={field.type}
                            placeholder={field.placeholder}
                            value={chatworkFormData[field.key] || ''}
                            onChange={(e) => setChatworkFormData({ ...chatworkFormData, [field.key]: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 mb-4">
                      APIトークンは Chatwork &gt; 動作設定 &gt; API設定 から取得できます
                    </p>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleChatworkAuth}
                        disabled={loading}
                        variant="primary"
                        size="sm"
                      >
                        {loading ? '接続中...' : '保存して接続'}
                      </Button>
                      <Button
                        onClick={() => { setShowChatworkForm(false); setChatworkFormData({}); }}
                        variant="outline"
                        size="sm"
                      >
                        キャンセル
                      </Button>
                    </div>
                  </Card>
                )}
              </div>

              {/* データ取得ルール説明 */}
              <Card variant="flat" padding="md" className="bg-slate-50 border border-slate-200 mt-2">
                <h3 className="text-sm font-medium text-slate-900 mb-3">データ取得ルール</h3>
                <ul className="text-xs text-slate-600 space-y-2">
                  <li className="flex gap-2">
                    <span className="shrink-0">•</span>
                    <span>接続するとメッセージは自動的にDBに取り込まれます</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="shrink-0">•</span>
                    <span>初回接続時は過去30日分のメッセージを取得します</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="shrink-0">•</span>
                    <span>2回目以降は前回取得以降の新着メッセージのみ取得します</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="shrink-0">•</span>
                    <span>「取得対象チャネル設定」で表示するチャネルを絞り込めます（未設定＝全表示）</span>
                  </li>
                </ul>
              </Card>
            </div>
          )}

          {/* ============================================ */}
          {/* プロジェクト種別タブ */}
          {/* ============================================ */}
          {activeTab === 'project-types' && (
            <div className="max-w-2xl">
              <FeatureGuide>
                <p className="font-medium mb-1">プロジェクト種別</p>
                <p>プロジェクト作成時に種別を選択すると、事前定義されたタスクテンプレートが自動生成されます。
                種別（親）にタスク（子）を登録する階層構造です。
                タスクの説明欄に業務内容を記載すると、AI会話時にコンテキストとして活用されます。</p>
              </FeatureGuide>
              <ProjectTypeManager />
            </div>
          )}

          {/* ============================================ */}
          {/* プロフィールタブ */}
          {/* ============================================ */}
          {activeTab === 'profile' && (
            <Card variant="outlined" padding="lg" className="max-w-2xl">
              <FeatureGuide>
                <p className="font-medium mb-1">プロフィール</p>
                <p>あなたの情報を設定すると、AIがよりカスタマイズされた応答を行います。
                性格タイプやAI応答スタイルはAI秘書の会話スタイルに反映されます。
                メール署名はメール返信時に自動挿入されます（Slack・Chatworkでは使用されません）。</p>
              </FeatureGuide>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">表示名</label>
                  <input
                    type="text"
                    value={profile.displayName}
                    onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">メールアドレス</label>
                  <input
                    type="email"
                    value={profile.email}
                    disabled
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 text-slate-500"
                  />
                  <p className="text-xs text-slate-500 mt-1.5">メールアドレスはログイン情報から取得されます</p>
                </div>

                {/* Phase 60: 16personalities */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">性格タイプ（16personalities）</label>
                  <select
                    value={profile.personalityType}
                    onChange={(e) => setProfile({ ...profile, personalityType: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {PERSONALITY_TYPES.map(pt => (
                      <option key={pt.value} value={pt.value}>{pt.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1.5">
                    AIがあなたの特性に合わせたコミュニケーションを行うために使用します。
                    <a href="https://www.16personalities.com/ja" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">診断はこちら</a>
                  </p>
                </div>

                {/* Phase 60: AI応答スタイル */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">AI応答スタイル</label>
                  <div className="space-y-2">
                    {AI_RESPONSE_STYLES.map(style => (
                      <label
                        key={style.value}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          profile.aiResponseStyle === style.value
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="aiResponseStyle"
                          value={style.value}
                          checked={profile.aiResponseStyle === style.value}
                          onChange={(e) => setProfile({ ...profile, aiResponseStyle: e.target.value })}
                          className="text-blue-600"
                        />
                        <div>
                          <span className="text-sm font-medium text-slate-900">{style.label}</span>
                          <p className="text-xs text-slate-500">{style.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">タイムゾーン</label>
                  <select
                    value={profile.timezone}
                    onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">America/New_York (EST)</option>
                    <option value="Europe/London">Europe/London (GMT)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">言語</label>
                  <select
                    value={profile.language}
                    onChange={(e) => setProfile({ ...profile, language: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ja">日本語</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">メール署名</label>
                  <textarea
                    value={profile.emailSignature}
                    onChange={(e) => setProfile({ ...profile, emailSignature: e.target.value })}
                    rows={5}
                    placeholder={"例:\n--\n鈴木 太郎\n株式会社○○ 営業部\nTEL: 03-xxxx-xxxx\nEmail: taro@example.com"}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                  />
                  <p className="text-xs text-slate-500 mt-1.5">メールでの返信・日程調整時に自動的に末尾に付与されます。Slack・Chatworkでは使用されません。</p>
                </div>
                <div className="pt-2">
                  <Button
                    onClick={handleSaveProfile}
                    disabled={loading}
                    variant="primary"
                    size="md"
                  >
                    {loading ? '保存中...' : 'プロフィールを保存'}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* ============================================ */}
          {/* 通知設定タブ */}
          {/* ============================================ */}
          {activeTab === 'notifications' && (
            <Card variant="outlined" padding="lg" className="max-w-2xl">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                  <span className="text-3xl">🔔</span>
                </div>
                <h3 className="text-lg font-bold text-slate-700 mb-2">準備中</h3>
                <p className="text-sm text-slate-500 max-w-sm">
                  通知設定機能は現在開発中です。今後のアップデートで、メール通知やデスクトップ通知の設定が可能になります。
                </p>
              </div>
            </Card>
          )}

          {/* Phase 30b: 初回セットアップタブ */}
          {activeTab === 'setup' && (
            <Card variant="outlined" padding="lg" className="max-w-2xl">
              <FeatureGuide>
                <p className="font-medium mb-1">初回セットアップ</p>
                <p>自社の情報、チームメンバー、プロジェクトを一括で登録できます。
                セットアップ完了後は、組織ページやコンタクトページからメンバーの追加・管理ができます。</p>
              </FeatureGuide>
              <div className="space-y-5">
                <Button
                  onClick={() => setShowSetupWizard(true)}
                  variant="primary"
                  size="lg"
                  className="w-full"
                >
                  初回セットアップを開始
                </Button>
              </div>
            </Card>
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
    </AppLayout>
  );
}
