import Image from 'next/image';
import { CHANNEL_CONFIG } from '@/lib/constants';
import { ChannelType } from '@/lib/types';

interface ChannelBadgeProps {
  channel: ChannelType;
}

export default function ChannelBadge({ channel }: ChannelBadgeProps) {
  const config = CHANNEL_CONFIG[channel];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor}`}
    >
      <Image
        src={config.icon}
        alt={config.label}
        width={14}
        height={14}
        className="shrink-0"
      />
      {config.label}
    </span>
  );
}
