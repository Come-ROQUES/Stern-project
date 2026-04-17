import { cn } from '../lib/utils';
import { GlassBadge } from './ui/glass';

type TopbarProps = {
    feed: string;
    risk: string;
    product: string;
    activeTab: string;
};

const modeItems = ['terminal', 'quant', 'backtest'] as const;

export function Topbar({ feed, risk, product, activeTab }: TopbarProps) {
    const getActiveMode = () => {
        if (['overview', 'market', 'strategy'].includes(activeTab)) return 'terminal';
        if (activeTab === 'quant-lab') return 'quant';
        if (activeTab === 'backtest') return 'backtest';
        return 'terminal';
    };

    const currentMode = getActiveMode();

    return (
        <div className="mb-4">
            <div className={cn(
                'flex items-center justify-between gap-4 px-4 py-3',
                'rounded-xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl',
            )}>
                <div>
                    <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-1">
                        Desk Terminal
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                        {product}
                    </h2>
                </div>

                <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-lg bg-white/[0.05] border border-white/[0.08] p-0.5">
                        {modeItems.map((item) => (
                            <span
                                key={item}
                                className={cn(
                                    'rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 cursor-default',
                                    currentMode === item
                                        ? 'bg-white/[0.12] text-white shadow-sm'
                                        : 'text-neutral-400'
                                )}
                            >
                                {item}
                            </span>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <GlassBadge variant="success" pulse size="md">{feed}</GlassBadge>
                    <GlassBadge variant="info" size="md">{risk}</GlassBadge>
                    <GlassBadge variant="default" size="md">{activeTab}</GlassBadge>
                </div>
            </div>
        </div>
    );
}
