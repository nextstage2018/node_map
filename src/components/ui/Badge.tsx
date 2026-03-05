import { cn } from '@/lib/utils';

// ===== Status Badge（dot付き）=====
// 用途: タスクステータス、メッセージ状態など
export type StatusColor = 'blue' | 'green' | 'yellow' | 'red' | 'slate';

const statusStyles: Record<StatusColor, { bg: string; text: string; dot: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  green: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  yellow: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  red: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' },
};

// ===== Label Badge（背景色付き）=====
// 用途: カテゴリ、タグ、チャネル種別など
export type LabelColor = 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'slate';

const labelStyles: Record<LabelColor, { bg: string; text: string }> = {
  blue: { bg: 'bg-blue-100', text: 'text-blue-700' },
  green: { bg: 'bg-green-100', text: 'text-green-700' },
  yellow: { bg: 'bg-amber-100', text: 'text-amber-700' },
  red: { bg: 'bg-red-100', text: 'text-red-700' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-700' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-600' },
};

interface BadgeProps {
  label: string;
  /** status: dot付き / label: 背景色付き */
  variant?: 'status' | 'label';
  /** variant='status' 用の色 */
  statusColor?: StatusColor;
  /** variant='label' 用の色 */
  labelColor?: LabelColor;
  size?: 'xs' | 'sm';
  className?: string;
  // 後方互換用
  color?: string;
  dotColor?: string;
}

export default function Badge({
  label,
  variant = 'label',
  statusColor = 'slate',
  labelColor = 'slate',
  size = 'sm',
  className,
  // 後方互換用
  color,
  dotColor,
}: BadgeProps) {
  const sizes = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-0.5 text-xs',
  };

  // 後方互換: color/dotColor が直接指定された場合はそちらを優先
  if (color || dotColor) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap',
        sizes[size],
        color || 'bg-slate-100 text-slate-600',
        className
      )}>
        {dotColor && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColor)} />}
        {label}
      </span>
    );
  }

  if (variant === 'status') {
    const style = statusStyles[statusColor];
    return (
      <span className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap',
        sizes[size],
        style.bg,
        style.text,
        className
      )}>
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', style.dot)} />
        {label}
      </span>
    );
  }

  // variant === 'label'
  const style = labelStyles[labelColor];
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap',
      sizes[size],
      style.bg,
      style.text,
      className
    )}>
      {label}
    </span>
  );
}
