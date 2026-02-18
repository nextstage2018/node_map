import { CHANNEL_CONFIG } from '@/lib/constants';
import { ChannelType } from '@/lib/types';

interface ChannelBadgeProps {
  channel: ChannelType;
}

export default function ChannelBadge({ channel }: ChannelBadgeProps) {
  const config = CHANNEL_CONFIG[channel];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor}`}
    >
      <span>{config.icon}</span>
      {config.label}
    </span>
  );
}
