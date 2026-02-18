'use client';

import { useState } from 'react';
import type { ChannelAuth, ChannelAuthType } from '@/lib/types';
import { CHANNEL_AUTH_CONFIG, AUTH_STATUS_CONFIG } from '@/lib/constants';
import { cn, formatRelativeTime } from '@/lib/utils';
import Button from '@/components/ui/Button';

interface ChannelAuthCardProps {
  channel: ChannelAuthType;
  auth: ChannelAuth;
  adminReady: boolean; // admin側でAPIが設定済みかどうか
  onAuth: (channel: ChannelAuthType) => Promise<void>;
  onRevoke: (channel: ChannelAuthType) => Promise<void>;
}

export default function ChannelAuthCard({
  channel,
  auth,
  adminReady,
  onAuth,
  onRevoke,
}: ChannelAuthCardProps) {
  const config = CHANNEL_AUTH_CONFIG[channel];
  const statusConfig = AUTH_STATUS_CONFIG[auth.status];
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleAuth = async () => {
    setIsAuthenticating(true);
    try {
      await onAuth(channel);
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-xl">
            {config.icon}
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">{config.label}</h3>
            <p className="text-xs text-gray-500">{config.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={cn('w-2 h-2 rounded-full', statusConfig.dotColor)} />
          <span className={cn('text-xs font-medium', statusConfig.color.split(' ')[1])}>
            {statusConfig.label}
          </span>
        </div>
      </div>

      {/* admin未設定の場合 */}
      {!adminReady && (
        <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
          <p className="text-xs text-amber-700">
            管理者によるAPI基盤設定がまだ完了していません。管理者に連絡してください。
          </p>
        </div>
      )}

      {/* 認証済みの場合 */}
      {auth.status === 'authenticated' && auth.accountName && (
        <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-green-800">
                {auth.accountName}
              </div>
              {auth.authenticatedAt && (
                <div className="text-[10px] text-green-600 mt-0.5">
                  認証日: {formatRelativeTime(auth.authenticatedAt)}
                </div>
              )}
            </div>
            <button
              onClick={() => onRevoke(channel)}
              className="text-[11px] text-red-500 hover:text-red-700 font-medium"
            >
              認証を解除
            </button>
          </div>
        </div>
      )}

      {/* 期限切れの場合 */}
      {auth.status === 'expired' && (
        <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
          <p className="text-xs text-amber-700 mb-2">
            認証の有効期限が切れています。再認証してください。
          </p>
        </div>
      )}

      {/* 認証ボタン */}
      {adminReady && auth.status !== 'authenticated' && (
        <div className="mt-3">
          <Button
            onClick={handleAuth}
            disabled={isAuthenticating}
            className="w-full text-sm"
          >
            {isAuthenticating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⟳</span> 認証中...
              </span>
            ) : (
              config.authButtonLabel
            )}
          </Button>
          <p className="text-[10px] text-gray-400 mt-1.5 text-center">
            {config.authMethod} で認証します
          </p>
        </div>
      )}
    </div>
  );
}
