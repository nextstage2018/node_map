import { cn } from '@/lib/utils';
import { HTMLAttributes, forwardRef } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'outlined' | 'flat';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hoverable?: boolean;
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', padding = 'md', hoverable = false, children, ...props }, ref) => {
    const base = 'rounded-xl transition-all';

    const variants = {
      default: 'bg-white border border-slate-200 shadow-sm',
      outlined: 'bg-white border border-slate-200',
      flat: 'bg-slate-50',
    };

    const paddings = {
      none: '',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6',
    };

    const hover = hoverable ? 'hover:shadow-md hover:border-slate-300 cursor-pointer' : '';

    return (
      <div
        ref={ref}
        className={cn(base, variants[variant], paddings[padding], hover, className)}
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

export { Card, CardHeader, CardBody };
export default Card;
