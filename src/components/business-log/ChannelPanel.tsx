'use client';

import {
  MessageSquare, X, Plus, Hash, ExternalLink, FileText,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/EmptyState';
import { ChannelMessage, ProjectChannel, formatDateTime } from './types';

// ========================================
// チャネル設定パネル
// ========================================
interface ChannelSettingsProps {
  projectChannels: ProjectChannel[];
  orgChannels: any[];
  hasOrganization: boolean;
  onAdd: (orgChannel: any) => void;
  onRemove: (channelId: string) => void;
  onClose: () => void;
}

export function ChannelSettings({
  projectChannels,
  orgChannels,
  hasOrganization,
  onAdd,
  onRemove,
  onClose,
}: ChannelSettingsProps) {
  return (
    <Card variant="default" padding="md" className="mx-6 mt-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">チャネル紐づけ設定</h3>
        <Button onClick={onClose} icon={X} variant="ghost" size="sm" />
      </div>

      {projectChannels.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">紐づけ済み</p>
          <div className="space-y-1">
            {projectChannels.map((ch) => (
              <div key={ch.id} className="flex items-center justify-between px-2.5 py-1.5 bg-blue-50 border border-blue-100 rounded-lg">
                <div className="flex items-center gap-2">
                  <Hash className="w-3 h-3 text-blue-500" />
                  <span className="text-xs text-slate-700">{ch.channel_label || ch.channel_identifier}</span>
                  <span className="text-[10px] text-slate-400">{ch.service_name}</span>
                </div>
                <Button onClick={() => onRemove(ch.id)} icon={X} variant="ghost" size="xs" />
              </div>
            ))}
          </div>
        </div>
      )}

      {orgChannels.length > 0 ? (
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">組織のチャネルから追加</p>
          <div className="space-y-1">
            {orgChannels
              .filter((oc: any) => !projectChannels.some(
                (pc) => pc.service_name === oc.service_name && pc.channel_identifier === oc.channel_id
              ))
              .map((oc: any) => (
                <Button
                  key={oc.id}
                  onClick={() => onAdd(oc)}
                  variant="outline"
                  size="sm"
                  className="w-full justify-between px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <Hash className="w-3 h-3 text-slate-400" />
                    <span className="text-xs text-slate-600">{oc.channel_name || oc.channel_id}</span>
                    <span className="text-[10px] text-slate-400">{oc.service_name}</span>
                  </div>
                  <Plus className="w-3 h-3 text-blue-500" />
                </Button>
              ))}
            {orgChannels.filter((oc: any) => !projectChannels.some(
              (pc) => pc.service_name === oc.service_name && pc.channel_identifier === oc.channel_id
            )).length === 0 && (
              <p className="text-xs text-slate-400 px-2">すべてのチャネルが紐づけ済みです</p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400">
          {hasOrganization
            ? '組織にチャネルが登録されていません。組織詳細ページでチャネルを追加してください。'
            : 'プロジェクトに組織を設定すると、組織のチャネルから選択できます。'}
        </p>
      )}
    </Card>
  );
}

// ========================================
// チャネルメッセージ一覧
// ========================================
interface ChannelMessagesListProps {
  messages: ChannelMessage[];
  isLoading: boolean;
}

export function ChannelMessagesList({ messages, isLoading }: ChannelMessagesListProps) {
  if (isLoading) return <div className="px-6 py-4"><LoadingState message="メッセージ読み込み中..." /></div>;

  if (messages.length === 0) {
    return (
      <div className="px-6 py-4">
        <div className="flex items-center justify-center h-48 text-slate-400">
          <div className="text-center">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-sm">メッセージがありません</p>
            <p className="text-xs mt-1">紐づけたチャネルにメッセージが届くとここに表示されます</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-4 space-y-2">
      {messages.map((msg) => {
        const isSent = msg.direction === 'sent';
        const serviceName = msg.channel || msg.metadata?.service || '';
        const serviceIcon = serviceName === 'slack' ? '#' : serviceName === 'chatwork' ? 'CW' : '@';
        return (
          <div
            key={msg.id}
            className={`p-3 rounded-lg border transition-colors ${
              isSent ? 'bg-blue-50 border-blue-100' : 'bg-white border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                {serviceIcon}
              </span>
              <span className="text-xs font-medium text-slate-700">
                {isSent ? 'あなた' : (msg.from_name || msg.from_address || '不明')}
              </span>
              {isSent && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600">送信</span>
              )}
              <span className="text-[10px] text-slate-400 ml-auto">
                {formatDateTime(msg.timestamp)}
              </span>
            </div>
            {msg.subject && <p className="text-xs font-medium text-slate-800 mb-0.5">{msg.subject}</p>}
            {msg.body && <p className="text-xs text-slate-600 line-clamp-3 whitespace-pre-wrap">{msg.body}</p>}
          </div>
        );
      })}
    </div>
  );
}

// ========================================
// ドキュメント一覧
// ========================================
interface DocumentListProps {
  documents: any[];
  isLoading: boolean;
}

export function DocumentList({ documents, isLoading }: DocumentListProps) {
  if (isLoading) return <div className="px-6 py-4"><LoadingState message="ドキュメント読み込み中..." /></div>;

  if (documents.length === 0) {
    return (
      <div className="px-6 py-4">
        <div className="flex items-center justify-center h-48 text-slate-400">
          <div className="text-center">
            <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-sm">ドキュメントがありません</p>
            <p className="text-xs mt-1">メッセージの添付ファイルが自動でGoogle Driveに保存されます</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-4 space-y-2">
      {documents.map((doc: Record<string, unknown>) => (
        <a
          key={doc.id as string}
          href={doc.drive_url as string}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          <span className="text-lg">
            {(doc.mime_type as string || '').includes('pdf') ? '📕' :
             (doc.mime_type as string || '').includes('image') ? '🖼️' :
             (doc.mime_type as string || '').includes('spreadsheet') ? '📊' :
             (doc.mime_type as string || '').includes('presentation') ? '📙' : '📄'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{doc.file_name as string}</p>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              {doc.file_size_bytes && <span>{((doc.file_size_bytes as number) / 1024).toFixed(0)}KB</span>}
              {doc.source_channel && <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px]">{doc.source_channel as string}</span>}
              {doc.uploaded_at && <span>{new Date(doc.uploaded_at as string).toLocaleDateString('ja-JP')}</span>}
            </div>
          </div>
          <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
        </a>
      ))}
    </div>
  );
}
