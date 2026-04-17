import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

type GlassPanelProps = {
    title?: string;
    className?: string;
    children: ReactNode;
};

export function GlassPanel({ title, className, children }: GlassPanelProps) {
    return (
        <div className={cn(
            'rounded-2xl border border-[rgba(0,255,136,0.06)] bg-white/[0.02] backdrop-blur-xl',
            'shadow-lg shadow-black/10',
            'transition-all duration-200',
            'hover:border-[rgba(0,255,136,0.12)]',
            'hover:shadow-[0_12px_30px_rgba(0,0,0,0.2),0_0_16px_rgba(0,255,136,0.02)]',
            className
        )}>
            {title && (
                <div className="border-b border-white/[0.06] px-5 py-4">
                    <h3 className="text-sm font-medium text-white">{title}</h3>
                </div>
            )}
            <div className="p-5">{children}</div>
        </div>
    );
}
