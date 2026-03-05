import { cn } from '@/lib/utils';
import { HTMLAttributes, forwardRef } from 'react';

// アクセントカラー（左ボーダー用）
export type AccentColor = 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'slate';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** default: 白背景+影 / interactive: hoverで影が強くなる / accent: 左ボーダー色付き */
  variant?: 'default' | 'interactive' | 'accent';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** accent バリアント時の左ボーダー色 */
  accent?: AccentColor;
  /** @deprecated — variant='interactive' を使ってください */
  hoverable?: boolean;
}

const accentColors: Record<AccentColor, string> = {
  blue: 'border-l-accent-blue',
  green: 'border-l-accent-green',
  yellow: 'border-l-accent-yellow',
  red: 'border-l-accent-red',
  purple: 'border-l-accent-purple',
  slate: 'border-l-accent-slate',
};

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', padding = 'md', accent = 'blue', hoverable = false, children, ...props }, ref) => {
    const base = 'rounded-xl transition-all';

    const variants = {
      default: 'bg-white border border-slate-200 shadow-nm-sm',
      interactive: 'bg-white border border-slate-200 shadow-nm-sm hover:shadow-nm-md hover:border-slate-300 cursor-pointer',
      accent: cn(
        'bg-white border border-slate-200 shadow-nm-sm border-l-[3px]',
        accentColors[accent]
      ),
    };

    const paddings = {
      none: '',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6',
    };

    // hoverable 後方互換: variant='default' + hoverable=true → interactive と同等
    const resolvedVariant = hoverable && variant === 'default' ? 'interactive' : variant;

    return (
      <div
        ref={ref}
        className={cn(base, variants[resolvedVariant], paddings[padding], className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

// Card.Header / Card.Body / Card.Footer サブコンポーネント
function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center justify-between mb-3', className)} {...props}>
      {children}
    </div>
  );
}

function CardBody({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('', className)} {...props}>
      {children}
    </div>
  );
}

function CardFooter({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center gap-2 mt-3 pt-3 border-t border-slate-100', className)} {...props}>
      {children}
    </div>
  );
}

export { Card, CardHeader, CardBody, CardFooter };
export default Card;
