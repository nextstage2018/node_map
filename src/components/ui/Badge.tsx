import { cn } from '@/lib/utils';

interface BadgeProps {
  label: string;
  color?: string;
  dotColor?: string;
  size?: 'xs' | 'sm';
  className?: string;
}

export default function Badge({ label, color = 'bg-slate-100 text-slate-600', dotColor, size = 'sm', className }: BadgeProps) {
  const sizes = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-0.5 text-xs',
  };

  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap', sizes[size], color, className)}>
      {dotColor && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColor)} />}
      {label}
    </span>
  );
}
