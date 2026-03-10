import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
    size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
};

export function LoadingSpinner({ size = 'md', className, ...props }: LoadingSpinnerProps) {
    return (
        <div {...props} className={cn('animate-spin', className)}>
            <Loader2 className={sizeClasses[size]} />
        </div>
    );
}
