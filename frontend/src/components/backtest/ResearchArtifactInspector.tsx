import React, { useEffect, useMemo, useState } from 'react';

import {
  api,
  type ResearchArtifactEquityResponse,
  type ResearchArtifactOverviewResponse,
  type ResearchArtifactPriceResponse,
  type ResearchArtifactProgressResponse,
  type ResearchArtifactRef,
  type ResearchArtifactTradesResponse,
} from '../../lib/api';
import { EmptyState, GlassBadge, GlassCard, SegmentedControl } from '../ui/glass';
import { TradeTable } from './results/TradeTable';

type ArtifactTab = 'summary' | 'trades' | 'price';

const TAB_OPTIONS: Array<{ value: ArtifactTab; label: string }> = [
  { value: 'summary', label: 'Synthese' },
  { value: 'trades', label: 'Trades' },
  { value: 'price', label: 'Prix' },
];

function statusTone(status: string): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'ok') return 'success';
  if (status === 'running' || status === 'artifact_stale') return 'warning';
  if (status === 'artifact_missing') return 'danger';
  return 'info';
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function summarizeArtifactValue(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'n/a';
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value || '""';
  if (Array.isArray(value)) return `${value.length} items`;
  if (value && typeof value === 'object') return `${Object.keys(value).length} keys`;
  if (value == null) return 'null';
  return String(value);
}

function MetricTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">{label}</div>
      <div className="mt-1 font-mono text-base text-white">{value}</div>
      {sub ? <div className="mt-1 text-[11px] text-neutral-500">{sub}</div> : null}
    </div>
  );
}

function SimpleLineChart({
  rows,
  valueKey,
  color,
  emptyLabel,
}: {
  rows: Array<Record<string, any>>;
  valueKey: string;
  color: string;
  emptyLabel: string;
}) {
  const points = useMemo(() => {
    const values = rows
      .map((row) => ({
        ts: String(row.ts ?? row.timestamp ?? ''),
        value: toNumber(row[valueKey]),
      }))
      .filter((row): row is { ts: string; value: number } => row.value != null);
    if (!values.length) return null;
    const width = 760;
    const height = 220;
    const pad = { top: 20, right: 20, bottom: 28, left: 48 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;
    const min = Math.min(...values.map((row) => row.value), 0);
    const max = Math.max(...values.map((row) => row.value), 0);
    const span = max - min || 1;
    const x = (index: number) => pad.left + (index / Math.max(values.length - 1, 1)) * chartW;
    const y = (value: number) => pad.top + chartH - ((value - min) / span) * chartH;
    const path = values.map((row, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(row.value)}`).join(' ');
    return { values, width, height, pad, min, max, x, y, path };
  }, [rows, valueKey]);

  if (!points) {
    return (
      <div className="h-[220px] flex items-center justify-center text-sm text-neutral-500">
        {emptyLabel}
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${points.width} ${points.height}`} className="w-full h-auto">
      <line
        x1={points.pad.left}
        y1={points.y(0)}
        x2={points.width - points.pad.right}
        y2={points.y(0)}
        stroke="rgba(255,255,255,0.12)"
        strokeDasharray="4,4"
      />
      <path d={points.path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <circle
        cx={points.x(points.values.length - 1)}
        cy={points.y(points.values[points.values.length - 1].value)}
        r="3"
        fill={color}
      />
      <text x={points.pad.left - 8} y={points.pad.top + 4} textAnchor="end" fill="#737373" fontSize="10">
        {points.max.toFixed(2)}
      </text>
      <text x={points.pad.left - 8} y={points.height - points.pad.bottom} textAnchor="end" fill="#737373" fontSize="10">
        {points.min.toFixed(2)}
      </text>
    </svg>
  );
}

type ChartSeries = {
  key: string;
  label: string;
  color: string;
};

type ChartMarker = {
  ts: string;
  value: number;
  kind: 'entry' | 'exit';
  direction?: string;
  tradeId?: string;
  pnl?: number | null;
  exitReason?: string;
};

function nearestSeriesValue(
  rows: Array<Record<string, any>>,
  valueKey: string,
  ts: string,
): number | null {
  const targetMs = Date.parse(ts);
  if (!Number.isFinite(targetMs)) return null;
  let bestValue: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const rowTs = String(row.ts ?? row.timestamp ?? '');
    const rowMs = Date.parse(rowTs);
    const value = toNumber(row[valueKey]);
    if (!Number.isFinite(rowMs) || value == null) continue;
    const distance = Math.abs(rowMs - targetMs);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestValue = value;
    }
  }
  return bestValue;
}

function ArtifactLineChart({
  rows,
  series,
  markers = [],
  emptyLabel,
  height = 260,
}: {
  rows: Array<Record<string, any>>;
  series: ChartSeries[];
  markers?: ChartMarker[];
  emptyLabel: string;
  height?: number;
}) {
  const chart = useMemo(() => {
    const validSeries = series.filter((item) =>
      rows.some((row) => toNumber(row[item.key]) != null)
    );
    if (!rows.length || !validSeries.length) return null;
    const width = 760;
    const pad = { top: 20, right: 20, bottom: 28, left: 48 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;
    const allValues = [
      ...validSeries.flatMap((item) =>
        rows.map((row) => toNumber(row[item.key])).filter((value): value is number => value != null)
      ),
      ...markers.map((marker) => marker.value).filter((value) => Number.isFinite(value)),
    ];
    if (!allValues.length) return null;
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const span = max - min || 1;
    const x = (index: number) => pad.left + (index / Math.max(rows.length - 1, 1)) * chartW;
    const y = (value: number) => pad.top + chartH - ((value - min) / span) * chartH;
    const tsIndex = new Map<string, number>();
    rows.forEach((row, index) => {
      tsIndex.set(String(row.ts ?? row.timestamp ?? ''), index);
    });
    const renderedSeries = validSeries.map((item) => {
      const points = rows
        .map((row, index) => {
          const value = toNumber(row[item.key]);
          return value == null ? null : { index, value };
        })
        .filter((point): point is { index: number; value: number } => point != null);
      if (!points.length) return null;
      const path = points
        .map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'}${x(point.index)},${y(point.value)}`)
        .join(' ');
      return { ...item, path };
    }).filter((item): item is ChartSeries & { path: string } => item != null);
    const renderedMarkers = markers
      .map((marker) => {
        const directIndex = tsIndex.get(marker.ts);
        const index = directIndex ?? rows.findIndex(
          (row) => String(row.ts ?? row.timestamp ?? '') === marker.ts
        );
        if (index < 0) return null;
        return {
          ...marker,
          cx: x(index),
          cy: y(marker.value),
        };
      })
      .filter((marker): marker is ChartMarker & { cx: number; cy: number } => marker != null);
    return { width, height, pad, min, max, y, renderedSeries, renderedMarkers };
  }, [height, markers, rows, series]);

  if (!chart) {
    return (
      <div className="h-[260px] flex items-center justify-center text-sm text-neutral-500">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="w-full h-auto">
        <line
          x1={chart.pad.left}
          y1={chart.y(0)}
          x2={chart.width - chart.pad.right}
          y2={chart.y(0)}
          stroke="rgba(255,255,255,0.12)"
          strokeDasharray="4,4"
        />
        {chart.renderedSeries.map((item) => (
          <path
            key={item.key}
            d={item.path}
            fill="none"
            stroke={item.color}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        ))}
        {chart.renderedMarkers.map((marker, index) => (
          <g key={`${marker.tradeId ?? marker.ts}-${marker.kind}-${index}`}>
            <circle
              cx={marker.cx}
              cy={marker.cy}
              r={marker.kind === 'entry' ? 4 : 3}
              fill={marker.kind === 'entry' ? '#22c55e' : '#f97316'}
              stroke={marker.direction === 'SHORT' ? '#fb7185' : '#e5e7eb'}
              strokeWidth="1.25"
            />
          </g>
        ))}
        <text x={chart.pad.left - 8} y={chart.pad.top + 4} textAnchor="end" fill="#737373" fontSize="10">
          {chart.max.toFixed(2)}
        </text>
        <text x={chart.pad.left - 8} y={chart.height - chart.pad.bottom} textAnchor="end" fill="#737373" fontSize="10">
          {chart.min.toFixed(2)}
        </text>
      </svg>
      <div className="flex items-center gap-3 flex-wrap text-[11px] text-neutral-500">
        {series.map((item) => (
          <div key={item.key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
            <span>{item.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span>Entrees</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-orange-500" />
          <span>Sorties</span>
        </div>
      </div>
    </div>
  );
}

export function ResearchArtifactInspector({
  artifact,
  artifactId,
}: {
  artifact?: ResearchArtifactRef | null;
  artifactId?: string | null;
}) {
  const requestedArtifactId = artifact?.artifact_id ?? artifactId ?? null;
  const [activeTab, setActiveTab] = useState<ArtifactTab>('summary');
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<ResearchArtifactOverviewResponse | null>(null);
  const [trades, setTrades] = useState<ResearchArtifactTradesResponse | null>(null);
  const [equity, setEquity] = useState<ResearchArtifactEquityResponse | null>(null);
  const [price, setPrice] = useState<ResearchArtifactPriceResponse | null>(null);
  const [progress, setProgress] = useState<ResearchArtifactProgressResponse | null>(null);
  const [pairsPrimarySeries, setPairsPrimarySeries] = useState<'z_score' | 'spread'>('z_score');
  const [showPairLegs, setShowPairLegs] = useState(false);

  useEffect(() => {
    if (!requestedArtifactId) {
      setOverview(null);
      setTrades(null);
      setEquity(null);
      setPrice(null);
      setProgress(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [overviewPayload, tradesPayload, equityPayload, pricePayload, progressPayload] =
          await Promise.all([
            api.getResearchArtifactOverview(requestedArtifactId),
            api.getResearchArtifactTrades(requestedArtifactId, 500, 0),
            api.getResearchArtifactEquity(requestedArtifactId),
            api.getResearchArtifactPrice(requestedArtifactId),
            api.getResearchArtifactProgress(requestedArtifactId),
          ]);
        if (cancelled) return;
        setOverview(overviewPayload);
        setTrades(tradesPayload);
        setEquity(equityPayload);
        setPrice(pricePayload);
        setProgress(progressPayload);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [requestedArtifactId]);

  const resolvedArtifact = overview?.artifact ?? artifact ?? null;
  const overviewPayload = overview?.overview ?? resolvedArtifact?.summary ?? {};
  const bundleStatus = useMemo(() => {
    const tradesAvailable = Boolean(trades?.data?.length);
    const equityAvailable = Boolean(equity?.data?.length);
    const priceAvailable = Boolean(price?.available && price?.price);
    const progressAvailable = Boolean(progress?.available && progress?.progress);
    const overviewAvailable = Boolean(
      overviewPayload && Object.keys(overviewPayload).length > 0
    );
    const detailCount = [
      tradesAvailable,
      equityAvailable,
      priceAvailable,
      progressAvailable,
    ].filter(Boolean).length;
    const status = resolvedArtifact?.status ?? 'pending';
    const summaryOnly =
      overviewAvailable && detailCount === 0 && status === 'artifact_missing';
    return {
      detailCount,
      overviewAvailable,
      tradesAvailable,
      equityAvailable,
      priceAvailable,
      progressAvailable,
      summaryOnly,
      label: summaryOnly
        ? 'Synthese de campagne uniquement'
        : detailCount === 0
          ? 'Bundle detail indisponible'
          : detailCount === 4
            ? 'Bundle detail complet'
            : 'Bundle detail partiel',
      message: summaryOnly
        ? "Ce candidat est visible via le campaign report, mais aucun artefact detaille regenere n'est disponible pour trades, equity ou prix."
        : detailCount === 0
          ? "Le desk a resolu cet artefact, mais les fichiers detailes attendus ne sont pas disponibles sur disque."
          : "Le desk peut afficher une partie des donnees detaillees, mais pas encore l'ensemble du bundle.",
    };
  }, [
    equity?.data,
    overviewPayload,
    price?.available,
    price?.price,
    progress?.available,
    progress?.progress,
    resolvedArtifact?.status,
    trades?.data,
  ]);
  const overviewFields = useMemo(
    () => Object.entries(overviewPayload).filter(([, value]) => value != null).slice(0, 12),
    [overviewPayload]
  );

  const overviewMetrics = useMemo(() => {
    const summary = overviewPayload;
    const totalTrades =
      toNumber(summary.total_trades)
      ?? toNumber(summary.aggregate_trades)
      ?? toNumber(summary.count);
    const pnl =
      toNumber(summary.gross_pnl_bps)
      ?? toNumber(summary.net_pnl_bps)
      ?? toNumber(summary.total_pnl)
      ?? toNumber(summary.median_oos_pnl_bps)
      ?? toNumber(summary.gross_pnl_pips)
      ?? toNumber(summary.median_oos_pnl_pips);
    const pf = toNumber(summary.profit_factor) ?? toNumber(summary.aggregate_pf);
    const dd = toNumber(summary.max_drawdown_bps) ?? toNumber(summary.max_drawdown_pips);
    return {
      totalTrades: totalTrades != null ? String(Math.round(totalTrades)) : 'n/a',
      pnl: pnl != null ? `${pnl > 0 ? '+' : ''}${pnl.toFixed(2)}` : 'n/a',
      profitFactor: pf != null ? pf.toFixed(2) : 'n/a',
      drawdown: dd != null ? dd.toFixed(2) : 'n/a',
    };
  }, [overviewPayload]);

  const priceSeries = useMemo(() => {
    const payload = price?.price;
    if (!payload || typeof payload !== 'object') return null;
    if (Array.isArray((payload as Record<string, any>).series)) {
      return {
        chartType: String((payload as Record<string, any>).chart_type ?? 'pairs'),
        valueKey: (payload as Record<string, any>).chart_type === 'pairs' ? pairsPrimarySeries : 'close',
        rows: ((payload as Record<string, any>).series as Array<Record<string, any>>) ?? [],
        hasLegs: true,
      };
    }
    if (Array.isArray((payload as Record<string, any>).ohlc)) {
      return {
        chartType: 'ohlc',
        valueKey: 'close',
        rows: ((payload as Record<string, any>).ohlc as Array<Record<string, any>>) ?? [],
        hasLegs: false,
      };
    }
    return null;
  }, [pairsPrimarySeries, price?.price]);

  const priceMarkers = useMemo(() => {
    if (!priceSeries?.rows.length || !trades?.data?.length) return [];
    const rows = priceSeries.rows;
    return (trades.data as Array<Record<string, any>>).flatMap((trade) => {
      const direction = String(trade.direction ?? '');
      const entryTs = String(trade.entry_ts ?? '');
      const exitTs = String(trade.exit_ts ?? '');
      const entryValue = priceSeries.chartType === 'pairs'
        ? (
            pairsPrimarySeries === 'spread'
              ? toNumber(trade.entry_spread) ?? nearestSeriesValue(rows, 'spread', entryTs)
              : toNumber(trade.entry_z) ?? toNumber(trade.entry_z_score) ?? nearestSeriesValue(rows, 'z_score', entryTs)
          )
        : toNumber(trade.entry_price) ?? nearestSeriesValue(rows, 'close', entryTs);
      const exitValue = priceSeries.chartType === 'pairs'
        ? (
            pairsPrimarySeries === 'spread'
              ? toNumber(trade.exit_spread) ?? nearestSeriesValue(rows, 'spread', exitTs)
              : toNumber(trade.exit_z) ?? nearestSeriesValue(rows, 'z_score', exitTs)
          )
        : toNumber(trade.exit_price) ?? nearestSeriesValue(rows, 'close', exitTs);
      const markers: ChartMarker[] = [];
      if (entryTs && entryValue != null) {
        markers.push({
          ts: entryTs,
          value: entryValue,
          kind: 'entry',
          direction,
          tradeId: String(trade.trade_id ?? ''),
          pnl: toNumber(trade.pnl_net_pips) ?? toNumber(trade.pnl_bps),
        });
      }
      if (exitTs && exitValue != null) {
        markers.push({
          ts: exitTs,
          value: exitValue,
          kind: 'exit',
          direction,
          tradeId: String(trade.trade_id ?? ''),
          pnl: toNumber(trade.pnl_net_pips) ?? toNumber(trade.pnl_bps),
          exitReason: String(trade.exit_reason ?? ''),
        });
      }
      return markers;
    });
  }, [pairsPrimarySeries, priceSeries, trades?.data]);

  if (!requestedArtifactId) {
    return (
      <GlassCard>
        <EmptyState
          title="Aucun artefact selectionne"
          message="Selectionne un candidat ou un run artefactise pour afficher trades, equity et vue prix."
        />
      </GlassCard>
    );
  }

  return (
    <GlassCard className="h-full">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-xs uppercase tracking-[0.16em] text-neutral-400">
              Artifact Inspector
            </div>
            <GlassBadge variant="info">
              {resolvedArtifact?.title ?? resolvedArtifact?.kind ?? requestedArtifactId}
            </GlassBadge>
            {resolvedArtifact?.stage && <GlassBadge variant="default">{resolvedArtifact.stage}</GlassBadge>}
            <GlassBadge variant={statusTone(resolvedArtifact?.status ?? 'pending')}>
              {resolvedArtifact?.status ?? 'pending'}
            </GlassBadge>
            {resolvedArtifact && (
              <GlassBadge variant={resolvedArtifact.canonical ? 'success' : 'warning'}>
                {resolvedArtifact.canonical ? 'canonical' : 'exploratory'}
              </GlassBadge>
            )}
          </div>
          <div className="mt-2 text-xs text-neutral-500">
            {resolvedArtifact?.campaign_id ?? 'campaign n/a'}
            {' · '}
            {resolvedArtifact?.candidate_id ?? 'candidate n/a'}
            {' · '}
            {resolvedArtifact?.phase ?? 'phase n/a'}
          </div>
        </div>
        <SegmentedControl
          options={TAB_OPTIONS}
          value={activeTab}
          onChange={(value) => setActiveTab(value as ArtifactTab)}
        />
      </div>

      {activeTab === 'summary' && (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-neutral-400">
                  Disponibilite
                </div>
                <div className="mt-1 text-sm text-neutral-200">{bundleStatus.label}</div>
                <div className="mt-1 text-xs text-neutral-500">{bundleStatus.message}</div>
              </div>
              <GlassBadge
                variant={
                  bundleStatus.detailCount === 4
                    ? 'success'
                    : bundleStatus.detailCount > 0
                      ? 'warning'
                      : 'danger'
                }
              >
                {bundleStatus.detailCount}/4 details
              </GlassBadge>
            </div>
            <div className="mt-3 grid grid-cols-2 xl:grid-cols-5 gap-2">
              <MetricTile label="Overview" value={bundleStatus.overviewAvailable ? 'OK' : 'n/a'} />
              <MetricTile label="Trades" value={bundleStatus.tradesAvailable ? 'OK' : 'missing'} />
              <MetricTile label="Equity" value={bundleStatus.equityAvailable ? 'OK' : 'missing'} />
              <MetricTile label="Prix" value={bundleStatus.priceAvailable ? 'OK' : 'missing'} />
              <MetricTile label="Progress" value={bundleStatus.progressAvailable ? 'OK' : 'missing'} />
            </div>
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <MetricTile label="Trades" value={overviewMetrics.totalTrades} />
            <MetricTile label="PnL" value={overviewMetrics.pnl} />
            <MetricTile label="PF" value={overviewMetrics.profitFactor} />
            <MetricTile label="Drawdown" value={overviewMetrics.drawdown} />
          </div>
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 xl:col-span-8 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-3 text-xs uppercase tracking-[0.16em] text-neutral-400">
                Equity
              </div>
              <SimpleLineChart
                rows={(equity?.data as Array<Record<string, any>>) ?? []}
                valueKey="cumulative_pnl"
                color="#22d3ee"
                emptyLabel={
                  loading
                    ? 'Chargement…'
                    : bundleStatus.summaryOnly
                      ? "Aucune courbe equity detaillee: seul le resume de campagne est disponible."
                      : 'Aucune courbe equity disponible.'
                }
              />
            </div>
            <div className="col-span-12 xl:col-span-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-3 text-xs uppercase tracking-[0.16em] text-neutral-400">
                Monitoring
              </div>
              <div className="space-y-2 text-xs">
                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div className="text-neutral-500">Logic source</div>
                  <div className="mt-1 font-mono text-neutral-200">
                    {resolvedArtifact?.backtest_logic_source || 'n/a'}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div className="text-neutral-500">Research mode</div>
                  <div className="mt-1 font-mono text-neutral-200">
                    {resolvedArtifact?.research_mode || 'n/a'}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div className="text-neutral-500">Progress</div>
                  {progress?.progress && typeof progress.progress === 'object' ? (
                    <div className="mt-2 space-y-1.5">
                      {Object.entries(progress.progress).slice(0, 6).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between gap-3">
                          <span className="text-neutral-500">{key}</span>
                          <span className="font-mono text-neutral-200">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-1 font-mono text-neutral-200">
                      {bundleStatus.summaryOnly
                        ? 'summary-only campaign payload'
                        : resolvedArtifact?.status === 'artifact_missing'
                          ? 'detail bundle missing'
                        : loading
                          ? 'chargement'
                          : 'n/a'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          {!!overviewFields.length && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-3 text-xs uppercase tracking-[0.16em] text-neutral-400">
                Resume Source
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 text-xs">
                {overviewFields.map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                  >
                    <div className="text-neutral-500">{key}</div>
                    <div className="mt-1 font-mono text-neutral-200 break-all">
                      {summarizeArtifactValue(value)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'trades' && (
        <div className="mt-4">
          {trades?.data?.length ? (
            <TradeTable
              isTrades={trades.data as Array<Record<string, unknown>>}
              oosTrades={[]}
              hasDualView={false}
              pageSize={50}
            />
          ) : (
            <EmptyState
              title="Trades indisponibles"
              message={
                bundleStatus.summaryOnly
                  ? "Le report de campagne connait ce candidat, mais aucun dump trades detaille n'a ete regenere pour cet artefact."
                  : resolvedArtifact?.status === 'artifact_missing'
                    ? "Cet artefact n'a pas encore de dump trades detaille."
                  : 'Aucun trade detaille disponible pour cet artefact.'
              }
            />
          )}
        </div>
      )}

      {activeTab === 'price' && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs uppercase tracking-[0.16em] text-neutral-400">
              Price View
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {priceSeries ? (
                <GlassBadge variant="info">{priceSeries.chartType}</GlassBadge>
              ) : (
                <GlassBadge variant={statusTone(resolvedArtifact?.status ?? 'pending')}>
                  {resolvedArtifact?.status ?? 'pending'}
                </GlassBadge>
              )}
              {priceSeries?.chartType === 'pairs' && (
                <>
                  <button
                    type="button"
                    onClick={() => setPairsPrimarySeries('z_score')}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] transition-colors ${
                      pairsPrimarySeries === 'z_score'
                        ? 'border-cyan-400/30 bg-cyan-500/[0.08] text-cyan-100'
                        : 'border-white/10 bg-white/[0.03] text-neutral-400 hover:bg-white/[0.06]'
                    }`}
                  >
                    z-score
                  </button>
                  <button
                    type="button"
                    onClick={() => setPairsPrimarySeries('spread')}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] transition-colors ${
                      pairsPrimarySeries === 'spread'
                        ? 'border-amber-400/30 bg-amber-500/[0.08] text-amber-100'
                        : 'border-white/10 bg-white/[0.03] text-neutral-400 hover:bg-white/[0.06]'
                    }`}
                  >
                    spread
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPairLegs((current) => !current)}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] transition-colors ${
                      showPairLegs
                        ? 'border-emerald-400/30 bg-emerald-500/[0.08] text-emerald-100'
                        : 'border-white/10 bg-white/[0.03] text-neutral-400 hover:bg-white/[0.06]'
                    }`}
                  >
                    jambes
                  </button>
                </>
              )}
            </div>
          </div>
          {priceSeries ? (
            <ArtifactLineChart
              rows={priceSeries.rows}
              series={[
                {
                  key: priceSeries.valueKey,
                  label: priceSeries.valueKey,
                  color: priceSeries.chartType === 'pairs'
                    ? (priceSeries.valueKey === 'spread' ? '#f59e0b' : '#22d3ee')
                    : '#22d3ee',
                },
              ]}
              markers={priceMarkers}
              emptyLabel="Aucune serie prix disponible."
            />
          ) : (
            <EmptyState
              title="Vue prix indisponible"
              message={
                bundleStatus.summaryOnly
                  ? "Le campaign report est disponible, mais la serie prix detaillee n'a pas ete artefactisee pour ce candidat."
                  : "Les anciens rapports restent consultables, mais la vue prix detaillee apparait seulement une fois le bundle d'artefacts regenere."
              }
            />
          )}
          {showPairLegs && priceSeries?.chartType === 'pairs' && (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="mb-3 text-xs uppercase tracking-[0.16em] text-neutral-400">
                Legs Overlay
              </div>
              <ArtifactLineChart
                rows={priceSeries.rows}
                series={[
                  { key: 'price_a', label: 'AUDUSD', color: '#34d399' },
                  { key: 'price_b', label: 'NZDUSD', color: '#a78bfa' },
                ]}
                emptyLabel="Les jambes ne sont pas disponibles pour cet artefact."
              />
            </div>
          )}
          {trades?.data?.length ? (
            <div className="mt-3 grid grid-cols-2 xl:grid-cols-4 gap-2 text-xs">
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-neutral-400">
                Trades overlays
                <div className="mt-1 font-mono text-neutral-200">{trades.data.length}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-neutral-400">
                Entrees
                <div className="mt-1 font-mono text-neutral-200">
                  {priceMarkers.filter((marker) => marker.kind === 'entry').length}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-neutral-400">
                Sorties
                <div className="mt-1 font-mono text-neutral-200">
                  {priceMarkers.filter((marker) => marker.kind === 'exit').length}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-neutral-400">
                Serie active
                <div className="mt-1 font-mono text-neutral-200">{priceSeries?.valueKey ?? 'n/a'}</div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </GlassCard>
  );
}
