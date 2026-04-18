/**
 * BacktestDataHealth.tsx - Price lake health, coverage, audit linkage
 *
 * Full-width glass rewrite for the backtest data tab.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle,
    Database,
    Eye,
    RefreshCw,
} from 'lucide-react';
import {
    api,
    type PriceLakeCoverageResponse,
    type PriceLakeHealthResponse,
} from '../../lib/api';
import { cn } from '../../lib/utils';
import { GlassCard, GlassKPI, GlassPanel } from '../ui/glass';

function fmtDateTime(value: string | null): string {
    if (!value) return 'n/a';
    return value.replace('T', ' ').slice(0, 19);
}

function CoverageGauge({
    label,
    value,
    threshold,
}: {
    label: string;
    value: number;
    threshold: number;
}) {
    const pct = Math.min(value * 100, 100);
    const thresholdPct = threshold * 100;
    const tone =
        value >= 0.99 ? 'emerald' : value >= threshold ? 'amber' : 'red';
    const textColor =
        tone === 'emerald'
            ? 'text-emerald-300'
            : tone === 'amber'
              ? 'text-amber-300'
              : 'text-red-300';
    const barColor =
        tone === 'emerald'
            ? 'bg-emerald-400'
            : tone === 'amber'
              ? 'bg-amber-400'
              : 'bg-red-400';

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
                    {label}
                </span>
                <span className={cn('text-sm font-semibold font-mono', textColor)}>
                    {pct.toFixed(2)}%
                </span>
            </div>
            <div className="relative h-2.5 rounded-full bg-white/[0.05] overflow-hidden">
                <div
                    className={cn('h-full rounded-full transition-all duration-300', barColor)}
                    style={{ width: `${pct}%` }}
                />
                <div
                    className="absolute top-0 h-full w-px bg-white/40"
                    style={{ left: `${thresholdPct}%` }}
                />
            </div>
            <div className="text-[10px] text-neutral-500">
                Seuil minimal: {thresholdPct.toFixed(0)}%
            </div>
        </div>
    );
}

const inputClass =
    'w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-neutral-100 ' +
    'focus:border-cyan-500/40 focus:outline-none transition-colors';

export function BacktestDataHealth() {
    const [health, setHealth] = useState<PriceLakeHealthResponse | null>(null);
    const [healthLoading, setHealthLoading] = useState(false);

    const [covSymbol, setCovSymbol] = useState('EURUSD');
    const [covInterval, setCovInterval] = useState(5);
    const [covStart, setCovStart] = useState('');
    const [covEnd, setCovEnd] = useState('');
    const [coverage, setCoverage] = useState<PriceLakeCoverageResponse | null>(null);
    const [covLoading, setCovLoading] = useState(false);

    const coverageThreshold = 0.95;

    const refreshHealth = useCallback(async () => {
        setHealthLoading(true);
        try {
            const response = await api.getLakeHealth();
            setHealth(response);
        } catch {
            setHealth(null);
        } finally {
            setHealthLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshHealth();
    }, [refreshHealth]);

    const canCheck = Boolean(covSymbol && covInterval && covStart && covEnd);

    const checkCoverage = useCallback(async () => {
        if (!canCheck) return;
        setCovLoading(true);
        setCoverage(null);
        try {
            const response = await api.getLakeCoverage(
                covSymbol,
                covInterval,
                covStart,
                covEnd
            );
            setCoverage(response);
        } catch {
            setCoverage(null);
        } finally {
            setCovLoading(false);
        }
    }, [canCheck, covEnd, covInterval, covStart, covSymbol]);

    const healthKpis = useMemo(
        () => [
            {
                label: 'Total Bars',
                value: health?.available ? health.total_bars.toLocaleString() : '—',
                sublabel: health?.date_range
                    ? `${health.date_range.min} → ${health.date_range.max}`
                    : 'Range indisponible',
            },
            {
                label: 'Files',
                value: health?.available ? health.total_files : '—',
                sublabel: health?.root ?? 'Lake indisponible',
            },
            {
                label: 'Symbols',
                value: health?.available ? health.symbols.length : '—',
                sublabel: health?.symbols.join(', ') || 'n/a',
            },
            {
                label: 'Intervals',
                value: health?.available ? health.intervals.length : '—',
                sublabel:
                    health?.intervals.map((interval) => `${interval}s`).join(', ') || 'n/a',
            },
            {
                label: 'Last Ingested',
                value: health?.available ? fmtDateTime(health.last_ingested_at) : '—',
                sublabel: healthLoading ? 'Refresh en cours' : 'Derniere observation',
            },
        ],
        [health, healthLoading]
    );

    return (
        <div className="space-y-4">
            <GlassPanel
                title="Price Lake Health"
                subtitle="Etat du lake parquet et verification de couverture avant execution"
                action={
                    <button
                        onClick={refreshHealth}
                        disabled={healthLoading}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-neutral-300 hover:bg-white/10 disabled:opacity-50"
                    >
                        <RefreshCw size={13} className={healthLoading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                }
            >
                <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
                    {healthKpis.map((item) => (
                        <GlassKPI
                            key={item.label}
                            label={item.label}
                            value={item.value}
                            sublabel={item.sublabel}
                            loading={healthLoading && !health}
                        />
                    ))}
                </div>
            </GlassPanel>

            <div className="grid grid-cols-12 gap-4">
                <GlassCard className="col-span-12 xl:col-span-5">
                    <div className="flex items-center gap-2 mb-4">
                        <Eye size={16} className="text-cyan-400" />
                        <div>
                            <div className="text-sm font-medium text-white">Verification de couverture</div>
                            <div className="text-xs text-neutral-500">
                                Verifie que la timeline de prix couvre la fenetre demandee
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] uppercase tracking-[0.16em] text-neutral-500 block mb-1.5">
                                Symbol
                            </label>
                            <select
                                value={covSymbol}
                                onChange={(event) => setCovSymbol(event.target.value)}
                                className={inputClass}
                            >
                                {(health?.symbols?.length ? health.symbols : ['EURUSD']).map(
                                    (symbol) => (
                                        <option key={symbol} value={symbol}>
                                            {symbol}
                                        </option>
                                    )
                                )}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase tracking-[0.16em] text-neutral-500 block mb-1.5">
                                Interval (s)
                            </label>
                            <select
                                value={covInterval}
                                onChange={(event) =>
                                    setCovInterval(Number(event.target.value))
                                }
                                className={inputClass}
                            >
                                {(health?.intervals?.length ? health.intervals : [5, 60]).map(
                                    (interval) => (
                                        <option key={interval} value={interval}>
                                            {interval}s
                                        </option>
                                    )
                                )}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase tracking-[0.16em] text-neutral-500 block mb-1.5">
                                Start (UTC)
                            </label>
                            <input
                                type="datetime-local"
                                value={covStart}
                                onChange={(event) => setCovStart(event.target.value)}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase tracking-[0.16em] text-neutral-500 block mb-1.5">
                                End (UTC)
                            </label>
                            <input
                                type="datetime-local"
                                value={covEnd}
                                onChange={(event) => setCovEnd(event.target.value)}
                                className={inputClass}
                            />
                        </div>
                    </div>

                    <button
                        onClick={checkCoverage}
                        disabled={!canCheck || covLoading}
                        className={cn(
                            'mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition-all',
                            canCheck
                                ? 'border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20'
                                : 'border border-white/5 bg-white/[0.02] text-neutral-500 cursor-not-allowed'
                        )}
                    >
                        <Eye size={14} />
                        {covLoading ? 'Verification...' : 'Verifier la couverture'}
                    </button>
                </GlassCard>

                <GlassCard className="col-span-12 xl:col-span-7">
                    <div className="flex items-center gap-2 mb-4">
                        <Database size={16} className="text-cyan-400" />
                        <div>
                            <div className="text-sm font-medium text-white">Resultat de couverture</div>
                            <div className="text-xs text-neutral-500">
                                Integrite de timeline et barres manquantes sur la fenetre selectionnee
                            </div>
                        </div>
                    </div>

                    {coverage ? (
                        <div className="space-y-5">
                            <CoverageGauge
                                label="Timeline Coverage"
                                value={coverage.timeline_coverage}
                                threshold={coverageThreshold}
                            />

                            <div className="grid grid-cols-3 gap-3">
                                <GlassKPI
                                    label="Expected"
                                    value={coverage.total_expected.toLocaleString()}
                                    size="sm"
                                />
                                <GlassKPI
                                    label="Present"
                                    value={coverage.total_present.toLocaleString()}
                                    size="sm"
                                    variant="success"
                                />
                                <GlassKPI
                                    label="Missing"
                                    value={coverage.missing_count.toLocaleString()}
                                    size="sm"
                                    variant={
                                        coverage.missing_count > 0 ? 'danger' : 'success'
                                    }
                                />
                            </div>

                            <div className="rounded-2xl border border-white/[0.06] bg-black/10 p-4">
                                <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500 mb-2">
                                    Perimetre de requete
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                    <div className="text-neutral-300">
                                        <span className="text-neutral-500">Symbol:</span>{' '}
                                        {coverage.symbol}
                                    </div>
                                    <div className="text-neutral-300">
                                        <span className="text-neutral-500">Interval:</span>{' '}
                                        {coverage.bar_interval_s}s
                                    </div>
                                    <div className="text-neutral-300">
                                        <span className="text-neutral-500">Start:</span>{' '}
                                        {coverage.start_ts}
                                    </div>
                                    <div className="text-neutral-300">
                                        <span className="text-neutral-500">End:</span>{' '}
                                        {coverage.end_ts}
                                    </div>
                                </div>
                            </div>

                            {coverage.timeline_coverage >= coverageThreshold ? (
                                <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 flex items-center gap-2 text-sm text-emerald-300">
                                    <CheckCircle size={16} />
                                    Coverage suffisante pour lancer le backtest sur cette
                                    fenetre.
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 flex items-center gap-2 text-sm text-red-200">
                                    <AlertTriangle size={16} />
                                    Couverture insuffisante pour un run fiable sur cette
                                    fenetre.
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="h-[260px] flex items-center justify-center text-sm text-neutral-500">
                            {covLoading
                                ? 'Analyse de couverture en cours...'
                                : 'Renseigner une fenetre puis lancer Verifier la couverture.'}
                        </div>
                    )}
                </GlassCard>
            </div>

            {coverage && coverage.timeline_coverage < coverageThreshold && (
                <GlassCard variant="warning">
                    <div className="flex items-start gap-3">
                        <AlertTriangle size={18} className="text-amber-300 mt-0.5" />
                        <div>
                            <div className="text-sm font-medium text-white">
                                Remediation recommandee
                            </div>
                            <ul className="mt-2 space-y-1 text-xs text-neutral-300">
                                <li>
                                    Re-ingerer les donnees manquantes via
                                    <code className="ml-1 text-amber-200">
                                        ingest_ib_history.py
                                    </code>
                                </li>
                                <li>
                                    Elargir la fenetre temporelle pour couvrir uniquement les
                                    heures de marche.
                                </li>
                                <li>
                                    Tester un intervalle plus large (ex: 60s au lieu de 5s).
                                </li>
                                <li>
                                    N’utiliser le fallback legacy dans Launch qu’en dernier
                                    recours.
                                </li>
                            </ul>
                        </div>
                    </div>
                </GlassCard>
            )}
        </div>
    );
}
