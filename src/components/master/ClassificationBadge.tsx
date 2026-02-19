'use client';

import { KNOWLEDGE_DOMAIN_CONFIG } from '@/lib/constants';

interface ClassificationBadgeProps {
  domainId?: string;
  fieldName?: string;
  size?: 'sm' | 'md';
}

export default function ClassificationBadge({
  domainId,
  fieldName,
  size = 'sm',
}: ClassificationBadgeProps) {
  if (!domainId) {
    return (
      <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-slate-100 text-slate-400 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
        未分類
      </span>
    );
  }

  const config = KNOWLEDGE_DOMAIN_CONFIG[domainId];
  if (!config) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}
      style={{
        backgroundColor: `${config.color}15`,
        color: config.color,
        border: `1px solid ${config.color}30`,
      }}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: config.color }}
      />
      {config.name}
      {fieldName && (
        <>
          <span className="text-slate-300 mx-0.5">/</span>
          {fieldName}
        </>
      )}
    </span>
  );
}
