'use client';

import { RELATIONSHIP_TYPE_CONFIG } from '@/lib/constants';
import type { PersonRelationshipType } from '@/lib/types';

interface RelationshipBadgeProps {
  type: PersonRelationshipType;
  confirmed?: boolean;
  size?: 'sm' | 'md';
}

export default function RelationshipBadge({
  type,
  confirmed = true,
  size = 'sm',
}: RelationshipBadgeProps) {
  const config = RELATIONSHIP_TYPE_CONFIG[type];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${config.bgColor} ${config.textColor} border ${config.borderColor} ${size === 'sm' ? 'text-xs' : 'text-sm'}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
      {config.label}
      {!confirmed && (
        <span className="text-slate-400 ml-0.5">?</span>
      )}
    </span>
  );
}
