/**
 * MobileSection - Collapsible section for mobile, always open on desktop.
 *
 * On screens < lg (1024px): renders a tappable header with chevron.
 * On desktop (>= lg): renders children directly, no toggle.
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface MobileSectionProps {
    title: string;
    children: React.ReactNode;
    /** Whether the section starts expanded on mobile. Default: false. */
    defaultOpen?: boolean;
    /** Optional item count badge shown next to the title. */
    badge?: string | number;
    className?: string;
}

export function MobileSection({
    title,
    children,
    defaultOpen = false,
    badge,
    className,
}: MobileSectionProps) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div className={className}>
            {/* Desktop: always show content, no header */}
            <div className="hidden lg:block">{children}</div>

            {/* Mobile: collapsible */}
            <div className="lg:hidden">
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className={cn(
                        'flex w-full items-center justify-between',
                        'rounded-lg px-3 py-2.5',
                        'bg-white/[0.03] border border-white/[0.06]',
                        'text-sm font-medium text-neutral-200',
                        'active:bg-white/[0.06] transition-colors',
                    )}
                >
                    <span className="flex items-center gap-2">
                        {title}
                        {badge !== undefined && (
                            <span className="text-[10px] text-neutral-400 bg-white/[0.06] px-1.5 py-0.5 rounded-full">
                                {badge}
                            </span>
                        )}
                    </span>
                    <ChevronDown
                        className={cn(
                            'h-4 w-4 text-neutral-400 transition-transform duration-200',
                            open && 'rotate-180',
                        )}
                    />
                </button>
                <div
                    className={cn(
                        'overflow-hidden transition-all duration-200',
                        open ? 'max-h-[5000px] opacity-100 mt-2' : 'max-h-0 opacity-0',
                    )}
                >
                    {children}
                </div>
            </div>
        </div>
    );
}
