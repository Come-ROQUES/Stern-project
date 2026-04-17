import { cn } from '../lib/utils';

type MetricCardProps = {
    title: string;
    value: string;
    sub?: string;
};

export function MetricCard({ title, value, sub }: MetricCardProps) {
    return (
        <div className={cn(
            'rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-5',
            'shadow-lg shadow-black/10',
            'transition-all duration-200 hover:border-white/[0.12] hover:-translate-y-0.5',
        )}>
            <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-2">
                {title}
            </div>
            <div className="text-2xl font-semibold font-mono text-white tracking-tight">
                {value}
            </div>
            {sub && (
                <div className="text-[11px] text-neutral-500 mt-1.5">
                    {sub}
                </div>
            )}
        </div>
    );
}
