import {
    LayoutDashboard,
    Activity,
    LineChart,
    TrendingUp,
    FlaskConical,
    Play,
    type LucideIcon,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { GlassBadge } from './ui/glass';

type TabDef = {
    section: 'DESK' | 'QUANT' | 'BACKTEST';
    id: string;
    title: string;
    code: string;
    icon: LucideIcon;
};

const tabs: TabDef[] = [
    { section: 'DESK', id: 'overview', title: 'Overview', code: 'OVR', icon: LayoutDashboard },
    { section: 'DESK', id: 'price-action', title: 'Price Action', code: 'PXA', icon: Activity },
    { section: 'DESK', id: 'market', title: 'Market', code: 'MKT', icon: LineChart },
    { section: 'DESK', id: 'strategy', title: 'Strategy', code: 'STR', icon: TrendingUp },
    { section: 'QUANT', id: 'quant-lab', title: 'Quant Lab', code: 'QLB', icon: FlaskConical },
    { section: 'BACKTEST', id: 'backtest', title: 'Backtest', code: 'BKT', icon: Play },
];

const sections = ['DESK', 'QUANT', 'BACKTEST'] as const;

type SidebarProps = {
    activeTab: string;
    onTabChange: (tab: string) => void;
    feedState: string;
    bookReady: boolean;
    quantReadiness: string;
    riskStatus: string;
};

function NavItem({ tab, active, onClick }: { tab: TabDef; active: boolean; onClick: () => void }) {
    const Icon = tab.icon;
    return (
        <button
            onClick={onClick}
            className={cn(
                'group w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-all duration-150',
                active
                    ? 'bg-cyan-500/12 text-white shadow-[0_0_0_1px_rgba(0,198,255,0.35)]'
                    : 'bg-transparent text-neutral-300 hover:bg-white/[0.06] hover:text-white'
            )}
        >
            <span
                className={cn(
                    'h-1.5 w-1.5 rounded-full transition-all duration-150',
                    active
                        ? 'bg-cyan-400 shadow-[0_0_10px_rgba(0,198,255,0.9)]'
                        : 'bg-white/20 group-hover:bg-cyan-400/50'
                )}
            />
            <Icon
                size={16}
                className={cn(
                    'transition-colors',
                    active ? 'opacity-100 text-cyan-300' : 'opacity-60 group-hover:opacity-100 text-neutral-300'
                )}
            />
            <span className="font-medium">{tab.title}</span>
            {tab.section === 'QUANT' && !active && (
                <GlassBadge variant="info" size="sm">R</GlassBadge>
            )}
        </button>
    );
}

export function Sidebar({ activeTab, onTabChange, feedState, bookReady, quantReadiness, riskStatus }: SidebarProps) {
    return (
        <aside className="sidebar">
            <div className="sidebar-brand px-4 pt-5 pb-4">
                <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">
                    Stern Systems
                </div>
                <h1 className="text-[28px] font-bold tracking-tight text-white">
                    Stern Crypto
                </h1>
                <div className="mt-2 text-[11px] uppercase tracking-[0.12em] text-neutral-500">
                    BTC-USD / Market Maker / Paper
                </div>
            </div>

            <nav className="flex flex-col gap-1 px-3 mt-2">
                {sections.map((section) => {
                    const sectionTabs = tabs.filter(t => t.section === section);
                    return (
                        <div key={section} className={cn(
                            'space-y-1',
                            section !== 'DESK' && 'mt-4 pt-4 border-t border-white/[0.06]'
                        )}>
                            <button className={cn(
                                'w-full flex items-center justify-between px-3 py-2 rounded-lg',
                                'text-[10px] uppercase tracking-[0.15em] font-medium text-neutral-400'
                            )}>
                                <span>{section}</span>
                                <span className="text-[9px] text-neutral-600">{sectionTabs.length}</span>
                            </button>
                            {sectionTabs.map(tab => (
                                <NavItem
                                    key={tab.id}
                                    tab={tab}
                                    active={activeTab === tab.id}
                                    onClick={() => onTabChange(tab.id)}
                                />
                            ))}
                        </div>
                    );
                })}
            </nav>

            <div className="mx-3 mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-4 shadow-lg shadow-black/10">
                <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-400 mb-3 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(44,227,255,0.5)] animate-pulse" />
                    Runtime
                </div>
                <div className="space-y-0">
                    {[
                        ['Feed', feedState],
                        ['Runtime', bookReady ? 'book ready' : 'warming'],
                        ['Quant', quantReadiness],
                        ['Risk', riskStatus],
                    ].map(([label, val]) => (
                        <div key={label} className="flex justify-between gap-3 py-2 border-b border-white/[0.06] last:border-0 text-xs">
                            <span className="text-neutral-500">{label}</span>
                            <span className={cn(
                                'text-neutral-300',
                                (val as string).includes('live') || (val as string).includes('ready') ? 'text-cyan-300' : '',
                                (val as string).includes('warming') || (val as string).includes('booting') ? 'text-amber-400' : '',
                            )}>{val}</span>
                        </div>
                    ))}
                </div>
            </div>
        </aside>
    );
}
