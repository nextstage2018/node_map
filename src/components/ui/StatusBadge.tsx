import { STATUS_CONFIG } from '@/lib/constants';
import { MessageStatus } from '@/lib/types';

interface StatusBadgeProps {
  status: MessageStatus;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${config.bgColor} ${config.textColor}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
      {config.label}
    </span>
  );
}
