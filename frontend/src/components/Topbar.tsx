import { cn } from '../lib/utils';
import { GlassBadge } from './ui/glass';

type TopbarProps = {
    feed: string;
    risk: string;
    quant: string;
    product: string;
    activeTab: string;
    messagesSeen: string;
};

const modeItems = ['terminal', 'quant', 'backtest'] as const;

function activeWorkspace(activeTab: string): string {
    if (activeTab === 'overview') return 'desk.overview';
    if (activeTab === 'price-action') return 'desk.price-action';
    if (activeTab === 'market') return 'market.micro';
    if (activeTab === 'strategy') return 'strategy.runtime';
    if (activeTab === 'quant-lab') return 'quant.regimes';
    return 'backtest.replay';
}

export function Topbar({ feed, risk, quant, product, activeTab, messagesSeen }: TopbarProps) {
    const getActiveMode = () => {
        if (['overview', 'price-action', 'market', 'strategy'].includes(activeTab)) return 'terminal';
        if (activeTab === 'quant-lab') return 'quant';
        if (activeTab === 'backtest') return 'backtest';
        return 'terminal';
    };

    const currentMode = getActiveMode();

    return (
        <div className="mb-4">
            <div className={cn(
                'topbar-shell flex items-center justify-between gap-4 px-4 py-3',
                'rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl shadow-lg shadow-black/10',
            )}>
                <div>
                    <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-1">
                        Trading Desk
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                            {product}
                        </h2>
                        <span className="h-4 w-px bg-white/[0.08]" />
                        <span className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">
                            runtime / paper
                        </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3 text-[10px] uppercase tracking-[0.14em] text-neutral-500 flex-wrap">
                        <span>workspace {activeWorkspace(activeTab)}</span>
                        <span className="h-2.5 w-px bg-white/[0.08]" />
                        <span>site stern-project</span>
                        <span className="h-2.5 w-px bg-white/[0.08]" />
                        <span>messages {messagesSeen}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-lg bg-white/[0.04] border border-white/[0.10] p-0.5">
                        {modeItems.map((item) => (
                            <span
                                key={item}
                                className={cn(
                                    'rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 cursor-default',
                                    currentMode === item
                                        ? 'bg-cyan-500/15 text-cyan-100 shadow-sm'
                                        : 'text-neutral-400'
                                )}
                            >
                                {item}
                            </span>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <GlassBadge variant="info" pulse size="md">{feed}</GlassBadge>
                    <GlassBadge variant="warning" size="md">{risk}</GlassBadge>
                    <GlassBadge variant="muted" size="md">{quant}</GlassBadge>
                    <GlassBadge variant="default" size="md">{activeTab}</GlassBadge>
                </div>
            </div>
        </div>
    );
}
