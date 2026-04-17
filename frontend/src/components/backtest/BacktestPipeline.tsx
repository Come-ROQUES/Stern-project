/**
 * BacktestPipeline.tsx - Animated pipeline visualization for running backtests.
 *
 * Shows the 3-layer architecture (OBSERVATION -> DECISION -> EXECUTION)
 * with live counters, event stream, and funnel metrics.
 */

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '../ui/glass';
import { cn } from '../../lib/utils';
import type { BacktestProgress, PipelineEvent } from '../../lib/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtPips(v: number): string {
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(2)}`;
}

function fmtDuration(s: number): string {
    if (s < 60) return `${s.toFixed(0)}s`;
    if (s < 3600) return `${(s / 60).toFixed(1)}m`;
    return `${(s / 3600).toFixed(1)}h`;
}

function fmtRate(v: number): string {
    if (v >= 10_000) return `${(v / 1000).toFixed(0)}k/s`;
    return `${v.toFixed(0)}/s`;
}

const EVENT_COLORS: Record<string, string> = {
    shock_detected: 'text-cyan-400',
    signal_generated: 'text-emerald-400',
    signal_rejected: 'text-red-400',
    trade_opened: 'text-blue-400',
    trade_closed: 'text-amber-400',
};

const EVENT_LABELS: Record<string, string> = {
    shock_detected: 'SHOCK',
    signal_generated: 'SIGNAL',
    signal_rejected: 'REJECT',
    trade_opened: 'OPEN',
    trade_closed: 'CLOSE',
};

// Hardcoded Tailwind class maps -- template strings like `border-${color}-500/50`
// don't work with Tailwind JIT. Must use full class names.
const LAYER_ACTIVE_STYLES: Record<string, string> = {
    cyan: 'border-cyan-500/50 bg-cyan-500/10 shadow-lg shadow-cyan-500/10',
    violet: 'border-violet-500/50 bg-violet-500/10 shadow-lg shadow-violet-500/10',
    amber: 'border-amber-500/50 bg-amber-500/10 shadow-lg shadow-amber-500/10',
};

const LAYER_DOT_STYLES: Record<string, string> = {
    cyan: 'bg-cyan-400',
    violet: 'bg-violet-400',
    amber: 'bg-amber-400',
};

const ARROW_TEXT_STYLES: Record<string, string> = {
    cyan: 'text-cyan-400',
    violet: 'text-violet-400',
    amber: 'text-amber-400',
};

const LAYER_COLORS: Record<string, string> = {
    OBSERVATION: 'cyan',
    DECISION: 'violet',
    EXECUTION: 'amber',
};

// ---------------------------------------------------------------------------
// Animated Counter
// ---------------------------------------------------------------------------

function AnimatedCounter({ value, label, color = 'text-neutral-200' }: {
    value: number | string;
    label: string;
    color?: string;
}) {
    return (
        <div className="text-center">
            <motion.div
                key={String(value)}
                initial={{ scale: 1.15, opacity: 0.7 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3 }}
                className={cn('text-lg font-mono font-bold', color)}
            >
                {typeof value === 'number' ? value.toLocaleString() : value}
            </motion.div>
            <div className="text-[10px] text-neutral-500 uppercase tracking-wider mt-0.5">{label}</div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Layer Block
// ---------------------------------------------------------------------------

function LayerBlock({ name, count, sublabel, isActive, color }: {
    name: string;
    count: number;
    sublabel: string;
    isActive: boolean;
    color: string;
}) {
    return (
        <div className={cn(
            'relative flex-1 rounded-xl border p-4 text-center transition-all duration-300',
            isActive
                ? LAYER_ACTIVE_STYLES[color] ?? 'border-white/[0.06] bg-white/[0.02]'
                : 'border-white/[0.06] bg-white/[0.02]'
        )}>
            {isActive && (
                <motion.div
                    className={cn('absolute top-2 right-2 w-2 h-2 rounded-full', LAYER_DOT_STYLES[color])}
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                />
            )}
            <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">{name}</div>
            <motion.div
                key={count}
                initial={{ scale: 1.1 }}
                animate={{ scale: 1 }}
                className="text-2xl font-mono font-bold text-neutral-200"
            >
                {count.toLocaleString()}
            </motion.div>
            <div className="text-[10px] text-neutral-500 mt-0.5">{sublabel}</div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Arrow connector
// ---------------------------------------------------------------------------

function Arrow({ ratio, color }: { ratio: string; color: string }) {
    return (
        <div className="flex flex-col items-center justify-center px-1">
            <motion.div
                className={cn('text-xs font-mono', ARROW_TEXT_STYLES[color])}
                animate={{ x: [0, 3, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
            >
                &rarr;
            </motion.div>
            <div className="text-[9px] text-neutral-600 mt-0.5">{ratio}</div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Event Stream
// ---------------------------------------------------------------------------

function EventStream({ events }: { events: PipelineEvent[] }) {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [events.length]);

    if (!events || events.length === 0) {
        return (
            <div className="text-neutral-600 text-xs text-center py-4">
                En attente d'evenements...
            </div>
        );
    }

    return (
        <div ref={scrollRef} className="max-h-48 overflow-y-auto font-mono text-xs space-y-0.5">
            <AnimatePresence mode="popLayout">
                {events.slice(-15).map((evt, i) => {
                    const color = EVENT_COLORS[evt.type] || 'text-neutral-400';
                    const label = EVENT_LABELS[evt.type] || evt.type;
                    const ts = evt.ts?.split('T')[1]?.slice(0, 8) || '';
                    const detail = formatEventDetail(evt);

                    return (
                        <motion.div
                            key={`${evt.wall_time}-${i}`}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="flex items-center gap-2 py-0.5 border-b border-white/[0.03]"
                        >
                            <span className="text-neutral-600 w-16 shrink-0">{ts}</span>
                            <span className={cn(color, 'w-14 shrink-0 font-medium')}>{label}</span>
                            <span className="text-neutral-400 truncate">{detail}</span>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}

function formatEventDetail(evt: PipelineEvent): string {
    const d = evt.data;
    switch (evt.type) {
        case 'shock_detected':
            return `z=${d.z_score?.toFixed(2) ?? '?'} amp=${d.amplitude_pips?.toFixed(1) ?? '?'}p`;
        case 'signal_generated':
            return `${d.direction ?? '?'} tp=${d.tp_pips?.toFixed(1) ?? '?'}p sl=${d.sl_pips?.toFixed(1) ?? '?'}p`;
        case 'signal_rejected':
            return d.reason || 'REJECTED';
        case 'trade_opened':
            return `${d.direction ?? '?'} ${d.trade_id ?? ''}`;
        case 'trade_closed':
            return `${d.direction ?? '?'} ${d.exit_reason ?? '?'} ${fmtPips(d.pnl_pips ?? 0)}p`;
        default:
            return JSON.stringify(d).slice(0, 60);
    }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function BacktestPipeline({ progress }: { progress: BacktestProgress | null }) {
    if (!progress) return null;

    const pipeline = progress.pipeline;
    const funnel = pipeline?.funnel;
    const activeLayer = pipeline?.layer || 'OBSERVATION';

    // Conversion ratios for arrows
    const shockToSignalRatio = funnel && funnel.shocks_detected > 0
        ? `${((funnel.signals_generated / funnel.shocks_detected) * 100).toFixed(0)}%`
        : '--';
    const signalToTradeRatio = funnel && funnel.signals_generated > 0
        ? `${((funnel.signals_accepted / funnel.signals_generated) * 100).toFixed(0)}%`
        : '--';

    return (
        <GlassCard variant="elevated" className="col-span-12">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <motion.div
                        className="w-2 h-2 rounded-full bg-cyan-400"
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ duration: 1, repeat: Infinity }}
                    />
                    <h3 className="text-sm font-medium text-neutral-300 uppercase tracking-wider">
                        Pipeline Monitor
                    </h3>
                    {progress.strategy && (
                        <span className="text-xs text-neutral-500 ml-2">
                            {progress.strategy.toUpperCase()}
                        </span>
                    )}
                </div>
                <div className="text-sm font-mono text-neutral-400">
                    {progress.pct.toFixed(1)}%
                </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-neutral-800 rounded-full h-1.5 mb-5 overflow-hidden">
                <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress.pct}%` }}
                    transition={{ duration: 0.5 }}
                />
            </div>

            {/* Speed / ETA row */}
            <div className="grid grid-cols-5 gap-3 mb-5">
                <AnimatedCounter
                    value={fmtRate(progress.bars_per_second)}
                    label="Speed"
                    color="text-cyan-400"
                />
                <AnimatedCounter
                    value={fmtDuration(progress.eta_seconds)}
                    label="ETA"
                />
                <AnimatedCounter
                    value={fmtDuration(progress.elapsed_seconds)}
                    label="Elapsed"
                />
                <AnimatedCounter
                    value={progress.trades_simulated}
                    label="Trades"
                    color="text-amber-400"
                />
                <AnimatedCounter
                    value={fmtPips(progress.current_pnl_pips)}
                    label="PnL Pips"
                    color={progress.current_pnl_pips >= 0 ? 'text-emerald-400' : 'text-red-400'}
                />
            </div>

            {/* 3-Layer Pipeline */}
            {funnel && (
                <div className="flex items-stretch gap-1 mb-5">
                    <LayerBlock
                        name="L1 Observation"
                        count={funnel.bars_scanned}
                        sublabel={`${funnel.shocks_detected} shocks`}
                        isActive={activeLayer === 'OBSERVATION'}
                        color={LAYER_COLORS.OBSERVATION}
                    />
                    <Arrow ratio={shockToSignalRatio} color="cyan" />
                    <LayerBlock
                        name="L2 Decision"
                        count={funnel.signals_generated}
                        sublabel={`${funnel.signals_accepted} accepted`}
                        isActive={activeLayer === 'DECISION'}
                        color={LAYER_COLORS.DECISION}
                    />
                    <Arrow ratio={signalToTradeRatio} color="violet" />
                    <LayerBlock
                        name="L3 Execution"
                        count={funnel.trades_opened}
                        sublabel={`${funnel.trades_closed} closed`}
                        isActive={activeLayer === 'EXECUTION'}
                        color={LAYER_COLORS.EXECUTION}
                    />
                </div>
            )}

            {/* Event Stream */}
            <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
                <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">
                    Live Events
                </div>
                <EventStream events={pipeline?.events || []} />
            </div>
        </GlassCard>
    );
}
