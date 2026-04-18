/**
 * BacktestCockpit - Strategy governance surface with pipeline progress.
 */

import React, { useEffect, useState } from 'react';

import { api, type ResearchCockpitRow } from '../../lib/api';
import { prefetchStrategyData } from '../../lib/useResearchData';
import { useViewActivity } from '../../lib/viewActivity';
import { cn } from '../../lib/utils';
import { EmptyState, GlassBadge, GlassCard } from '../ui/glass';
import { CockpitSkeleton } from './skeletons';
import { PipelineProgressDots } from './PipelineProgressDots';

// ── Helpers ──────────────────────────────────────────────────────────────────

const STRATEGY_ACCENT: Record<string, string> = {
  damping_wave: 'border-cyan-400/30 bg-cyan-500/[0.08]',
  s2_pairs_trading: 'border-violet-400/30 bg-violet-500/[0.08]',
  tf_pullback_v1: 'border-emerald-400/30 bg-emerald-500/[0.08]',
};

const STRATEGY_ACCENT_IDLE: Record<string, string> = {
  damping_wave: 'hover:border-cyan-400/15 hover:bg-cyan-500/[0.03]',
  s2_pairs_trading: 'hover:border-violet-400/15 hover:bg-violet-500/[0.03]',
  tf_pullback_v1: 'hover:border-emerald-400/15 hover:bg-emerald-500/[0.03]',
};

const STRATEGY_TEXT: Record<string, string> = {
  damping_wave: 'text-cyan-400',
  s2_pairs_trading: 'text-violet-400',
  tf_pullback_v1: 'text-emerald-400',
};

function badgeTone(status: string): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  if (status.includes('match') || status === 'pending') return 'success';
  if (status === 'running' || status === 'campaign_running' || status === 'runtime_unresolved') {
    return 'warning';
  }
  if (status === 'blocked' || status.includes('mismatch')) return 'danger';
  if (status === 'stalled' || status === 'campaign_stalled') return 'danger';
  if (status === 'unknown') return 'warning';
  return 'info';
}

function deriveCompletedStages(row: ResearchCockpitRow): string[] {
  const stages: string[] = [];
  if (row.available) stages.push('sanity');
  if (row.active_campaign_id) stages.push('campaign');
  if (row.retained_candidates > 0) stages.push('candidate');
  const activeStage = row.active_stage?.toLowerCase() ?? '';
  if (['walkforward', 'stress', 'promotion', 'manifest', 'paper'].some(s => activeStage.includes(s))) {
    stages.push('walkforward');
  }
  if (['stress', 'promotion', 'manifest', 'paper'].some(s => activeStage.includes(s))) {
    stages.push('stress');
  }
  if (['promotion', 'manifest', 'paper'].some(s => activeStage.includes(s))) {
    stages.push('promotion');
  }
  if (['manifest', 'paper'].some(s => activeStage.includes(s))) {
    stages.push('manifest');
  }
  if (activeStage.includes('paper')) {
    stages.push('paper');
  }
  return stages;
}

function deriveActiveStage(row: ResearchCockpitRow): string | null {
  const s = row.active_stage?.toLowerCase() ?? '';
  if (s.includes('paper')) return 'paper';
  if (s.includes('manifest')) return 'manifest';
  if (s.includes('promotion')) return 'promotion';
  if (s.includes('stress')) return 'stress';
  if (s.includes('walk') || s.includes('wf')) return 'walkforward';
  if (s.includes('candidate')) return 'candidate';
  if (s.includes('campaign')) return 'campaign';
  return 'sanity';
}

// ── Component ────────────────────────────────────────────────────────────────

export function BacktestCockpit({
  selectedStrategyId,
  onSelectStrategy,
}: {
  selectedStrategyId: string | null;
  onSelectStrategy: (strategyId: string) => void;
}) {
  const viewActive = useViewActivity();
  const [rows, setRows] = useState<ResearchCockpitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!viewActive) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await api.getResearchCockpit();
        if (cancelled) return;
        const nextRows = payload.rows ?? [];
        setRows(nextRows);
        if (!selectedStrategyId && nextRows.length) {
          onSelectStrategy(nextRows[0].strategy_id);
        }
      } catch (err) {
        if (!cancelled) {
          setRows([]);
          setError(err instanceof Error ? err.message : 'Cockpit load failed');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [onSelectStrategy, selectedStrategyId, viewActive]);

  if (loading && !rows.length) {
    return <CockpitSkeleton />;
  }

  if (error && !rows.length) {
    return (
      <GlassCard>
        <EmptyState title="Cockpit unavailable" message={error} />
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white tracking-wide uppercase">
            Research Pipeline
          </h2>
          <p className="text-xs text-neutral-500 mt-1">
            Governance surface across S1 / S2 / S3
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        {rows.map((row) => {
          const selected = row.strategy_id === selectedStrategyId;
          const accent = STRATEGY_ACCENT[row.strategy_id] ?? 'border-white/10 bg-white/[0.03]';
          const accentIdle = STRATEGY_ACCENT_IDLE[row.strategy_id] ?? 'hover:bg-white/[0.05]';
          const textAccent = STRATEGY_TEXT[row.strategy_id] ?? 'text-white';
          const completedStages = deriveCompletedStages(row);
          const activeStage = deriveActiveStage(row);
          const hasBlockers = row.governance_blockers.length > 0;

          return (
            <button
              key={row.strategy_id}
              type="button"
              onClick={() => onSelectStrategy(row.strategy_id)}
              onMouseEnter={() => prefetchStrategyData(row.strategy_id)}
              className={cn(
                'rounded-2xl border p-4 text-left transition-all duration-150',
                selected ? accent : cn('border-white/[0.08] bg-white/[0.03]', accentIdle),
              )}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className={cn('text-sm font-semibold', selected ? textAccent : 'text-white')}>
                    {row.strategy_label}
                  </div>
                  <div className="mt-0.5 text-[10px] text-neutral-500 font-mono">
                    {row.owner_service}
                  </div>
                </div>
                <GlassBadge variant={row.available ? 'success' : 'warning'}>
                  {row.available ? 'online' : 'offline'}
                </GlassBadge>
              </div>

              {/* Pipeline Progress */}
              <div className="mt-3">
                <PipelineProgressDots
                  activeStage={activeStage}
                  completedStages={completedStages}
                  blockedStage={hasBlockers ? activeStage : null}
                />
              </div>

              {/* Status badges */}
              <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                <GlassBadge variant={badgeTone(row.runtime_status)}>
                  {row.runtime_status}
                </GlassBadge>
                <GlassBadge variant={badgeTone(row.paper_status)}>
                  {row.paper_status}
                </GlassBadge>
                {row.jobs_in_progress > 0 && (
                  <GlassBadge variant="warning">{row.jobs_in_progress} running</GlassBadge>
                )}
              </div>

              {/* KPIs grid */}
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-neutral-500">Campaign</div>
                  <div className="font-mono text-white truncate">
                    {row.active_campaign_id?.slice(0, 12) ?? '--'}
                  </div>
                </div>
                <div>
                  <div className="text-neutral-500">Champion</div>
                  <div className="font-mono text-white truncate">
                    {row.recommended_candidate_id?.slice(0, 12) ?? '--'}
                  </div>
                </div>
                <div>
                  <div className="text-neutral-500">Retained</div>
                  <div className="font-mono text-white">{row.retained_candidates}</div>
                </div>
              </div>

              {/* Drift + Blockers */}
              <div className="mt-3 flex items-center justify-between text-[10px]">
                <span className="text-neutral-500">
                  Drift: <span className="text-neutral-400">{row.drift_status}</span>
                </span>
                {hasBlockers && (
                  <span className="text-amber-300/80 truncate ml-2">
                    {row.governance_blockers[0]}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
