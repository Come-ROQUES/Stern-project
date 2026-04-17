import { useState, useCallback, type ReactNode } from 'react';
import { X, Maximize2 } from 'lucide-react';
import { cn } from '../lib/utils';

type BentoCardProps = {
    title: string;
    subtitle?: string;
    children: ReactNode;
    expandedContent?: ReactNode;
    className?: string;
    accent?: 'green' | 'cyan' | 'amber' | 'red';
    compact?: boolean;
};

const accentMap = {
    green: {
        border: 'rgba(255,255,255,0.08)',
        hoverBorder: 'rgba(255,255,255,0.12)',
        glow: 'rgba(0,255,136,0.03)',
        gradient: 'rgba(0,255,136,0.05)',
        dot: 'bg-emerald-400',
        dotGlow: 'shadow-[0_0_8px_rgba(16,185,129,0.45)]',
    },
    cyan: {
        border: 'rgba(255,255,255,0.08)',
        hoverBorder: 'rgba(255,255,255,0.12)',
        glow: 'rgba(44,227,255,0.03)',
        gradient: 'rgba(44,227,255,0.05)',
        dot: 'bg-cyan-300',
        dotGlow: 'shadow-[0_0_8px_rgba(103,232,249,0.45)]',
    },
    amber: {
        border: 'rgba(255,255,255,0.08)',
        hoverBorder: 'rgba(255,255,255,0.12)',
        glow: 'rgba(234,179,8,0.03)',
        gradient: 'rgba(234,179,8,0.05)',
        dot: 'bg-amber-400',
        dotGlow: 'shadow-[0_0_8px_rgba(234,179,8,0.45)]',
    },
    red: {
        border: 'rgba(255,255,255,0.08)',
        hoverBorder: 'rgba(255,255,255,0.12)',
        glow: 'rgba(255,77,77,0.03)',
        gradient: 'rgba(255,77,77,0.05)',
        dot: 'bg-red-400',
        dotGlow: 'shadow-[0_0_8px_rgba(248,113,113,0.45)]',
    },
};

export function BentoCard({
    title,
    subtitle,
    children,
    expandedContent,
    className,
    accent = 'green',
    compact = false,
}: BentoCardProps) {
    const [expanded, setExpanded] = useState(false);
    const a = accentMap[accent];

    const toggle = useCallback(() => {
        if (expandedContent) setExpanded(prev => !prev);
    }, [expandedContent]);

    return (
        <>
            <div
                className={cn(
                    'relative rounded-2xl overflow-hidden',
                    'backdrop-blur-xl transition-all duration-200',
                    'group cursor-default flex flex-col',
                    compact ? 'p-3' : 'p-0',
                    className,
                )}
                style={{
                    border: `1px solid ${a.border}`,
                    background: `linear-gradient(145deg, rgba(255,255,255,0.04), transparent 38%), linear-gradient(145deg, ${a.gradient}, transparent 58%), rgba(255,255,255,0.025)`,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 18px 30px rgba(0,0,0,0.16)`,
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = a.hoverBorder;
                    e.currentTarget.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,0.04), 0 18px 30px rgba(0,0,0,0.2), 0 0 24px ${a.glow}`;
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = a.border;
                    e.currentTarget.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,0.04), 0 18px 30px rgba(0,0,0,0.16)`;
                }}
            >
                <div className="pointer-events-none absolute inset-0"
                    style={{
                        background: `linear-gradient(180deg, rgba(255,255,255,0.045), transparent 16%), radial-gradient(ellipse at 20% 0%, ${a.gradient}, transparent 50%), radial-gradient(ellipse at 80% 100%, rgba(44,227,255,0.02), transparent 50%)`,
                    }}
                />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.08]" />

                <div className={cn(
                    'relative z-10 flex items-center justify-between',
                    compact ? 'mb-2' : 'px-4 py-3 border-b border-white/[0.06]',
                )}>
                    <div className="flex items-center gap-2 min-w-0">
                        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', a.dot, a.dotGlow)} />
                        <div className="min-w-0">
                            <h3 className={cn(
                                'font-medium text-white truncate uppercase tracking-[0.12em]',
                                compact ? 'text-[10px]' : 'text-[11px]',
                            )}>{title}</h3>
                            {subtitle && (
                                <span className="text-[10px] text-neutral-500 block truncate mt-0.5">{subtitle}</span>
                            )}
                        </div>
                    </div>
                    {expandedContent && (
                        <button
                            onClick={toggle}
                            className="p-1 rounded-lg text-neutral-500 hover:text-white hover:bg-white/[0.08] transition-all duration-150 opacity-0 group-hover:opacity-100"
                        >
                            <Maximize2 size={12} />
                        </button>
                    )}
                </div>

                <div className={cn(
                    'relative z-10 flex-1 min-h-0',
                    !compact && 'px-3 py-2',
                )}>
                    {children}
                </div>
            </div>

            {expanded && expandedContent && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-8"
                    onClick={toggle}
                >
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                    <div
                        className="relative w-full max-w-6xl max-h-[90vh] overflow-auto rounded-2xl"
                        style={{
                            border: `1px solid ${a.hoverBorder}`,
                            background: `linear-gradient(145deg, ${a.gradient}, transparent 30%), rgba(8,12,20,0.95)`,
                            boxShadow: `0 24px 80px rgba(0,0,0,0.5), 0 0 40px ${a.glow}`,
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
                            <div className="flex items-center gap-2">
                                <span className={cn('h-2 w-2 rounded-full', a.dot, a.dotGlow)} />
                                <h3 className="text-sm font-medium text-white">{title}</h3>
                                {subtitle && <span className="text-xs text-neutral-500 ml-2">{subtitle}</span>}
                            </div>
                            <button
                                onClick={toggle}
                                className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-all duration-150"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="p-6">
                            {expandedContent}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
