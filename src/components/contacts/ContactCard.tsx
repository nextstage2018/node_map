'use client';

import Image from 'next/image';
import { CHANNEL_CONFIG } from '@/lib/constants';
import type { ContactPerson, PersonRelationshipType } from '@/lib/types';
import RelationshipBadge from './RelationshipBadge';

interface ContactCardProps {
  contact: ContactPerson;
  onRelationshipChange: (id: string, type: PersonRelationshipType) => void;
}

export default function ContactCard({
  contact,
  onRelationshipChange,
}: ContactCardProps) {
  const initials = contact.name.slice(0, 1);

  // 関係属性の切替メニュー
  const relationshipOptions: PersonRelationshipType[] = ['internal', 'client', 'partner'];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-3">
        {/* アバター */}
        <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm shrink-0">
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          {/* 名前 + 関係属性 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-900">{contact.name}</span>
            <RelationshipBadge type={contact.relationshipType} confirmed={contact.confirmed} />
          </div>

          {/* チャネル情報 */}
          <div className="mt-1.5 flex flex-wrap gap-2">
            {contact.channels.map((ch) => {
              const channelCfg = CHANNEL_CONFIG[ch.channel];
              return (
                <div
                  key={`${ch.channel}-${ch.address}`}
                  className="inline-flex items-center gap-1 text-xs text-slate-500"
                >
                  <Image
                    src={channelCfg.icon}
                    alt={channelCfg.label}
                    width={12}
                    height={12}
                  />
                  <span className="truncate max-w-[140px]">{ch.address}</span>
                  <span className="text-slate-300">({ch.frequency})</span>
                </div>
              );
            })}
          </div>

          {/* メタ情報 */}
          <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
            <span>通信 {contact.messageCount}回</span>
            <span>最終 {new Date(contact.lastContactAt).toLocaleDateString('ja-JP')}</span>
            {contact.mainChannel && (
              <span>メイン: {CHANNEL_CONFIG[contact.mainChannel].label}</span>
            )}
          </div>
        </div>

        {/* 関係属性変更ドロップダウン */}
        {!contact.confirmed && (
          <select
            value={contact.relationshipType}
            onChange={(e) =>
              onRelationshipChange(contact.id, e.target.value as PersonRelationshipType)
            }
            className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {relationshipOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt === 'internal' ? '自社メンバー' : opt === 'client' ? 'クライアント' : 'パートナー'}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
