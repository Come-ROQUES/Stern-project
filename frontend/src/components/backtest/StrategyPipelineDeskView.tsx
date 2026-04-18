import React, { useEffect, useMemo, useState } from 'react';

import {
  type ResearchArtifactRef,
  type ResearchCandidate,
  type ResearchCampaign,
  type ResearchLaunchCapabilitiesResponse,
  type ResearchPaperMatchResponse,
  type ResearchRun,
  type S2ResearchDeskResponse,
} from '../../lib/api';
import { cn } from '../../lib/utils';
import { EmptyState, GlassBadge, GlassCard, SegmentedControl } from '../ui/glass';
import { PaperMatchDesk } from './PaperMatchDesk';
import { PromotionDesk } from './PromotionDesk';
import { ResearchArtifactInspector } from './ResearchArtifactInspector';
import { RunsDesk } from './RunsDesk';

export type StrategyPipelineDeskTab =
  | 'campaigns'
  | 'candidates'
  | 'walkforward'
  | 'promotion'
  | 'paper_match'
  | 'runs'
  | 'launch';

type CandidateFilter = 'all' | 'retained' | 'rejected' | 'recommended' | 'runtime';

const DESK_TABS: Array<{ value: StrategyPipelineDeskTab; label: string }> = [
  { value: 'campaigns', label: 'Campaigns' },
  { value: 'candidates', label: 'Candidates' },
  { value: 'walkforward', label: 'Walk-Forward' },
  { value: 'promotion', label: 'Promotion' },
  { value: 'paper_match', label: 'Paper Match' },
  { value: 'runs', label: 'Runs' },
  { value: 'launch', label: 'Launch' },
];

const FILTER_OPTIONS: Array<{ value: CandidateFilter; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'retained', label: 'Retenus' },
  { value: 'rejected', label: 'Rejects' },
  { value: 'recommended', label: 'Champion' },
  { value: 'runtime', label: 'Runtime' },
];

function fmtSigned(value: number | null | undefined, digits = 1, suffix = ''): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}${suffix}`;
}

function pct(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return `${(value * 100).toFixed(digits)}%`;
}

function statusTone(status: string): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  if (
    status === 'paper_runtime_match'
    || status === 'recommended'
    || status === 'runtime_matches_recommended'
    || status === 'ready_for_paper'
    || status === 'pass'
    || status === 'promoted'
  ) {
    return 'success';
  }
  if (
    status === 'needs_stress'
    || status === 'paper_candidate_selected'
    || status === 'runtime_unresolved'
    || status === 'running'
    || status === 'campaign_running'
    || status === 'artifact_stale'
    || status === 'pending'
  ) {
    return 'warning';
  }
  if (
    status === 'rejected'
    || status === 'runtime_mismatch'
    || status === 'blocked'
    || status === 'stalled'
    || status === 'campaign_stalled'
    || status === 'artifact_missing'
  ) {
    return 'danger';
  }
  return 'info';
}

function artifactStatusRank(status: string | null | undefined): number {
  if (status === 'ok') return 4;
  if (status === 'running') return 3;
  if (status === 'artifact_stale') return 2;
  if (status === 'artifact_missing') return 1;
  return 0;
}

function selectPreferredArtifact(
  artifacts: ResearchArtifactRef[],
): ResearchArtifactRef | null {
  if (!artifacts.length) return null;
  return [...artifacts].sort((left, right) => {
    const rankDiff =
      artifactStatusRank(right.status) - artifactStatusRank(left.status);
    if (rankDiff !== 0) return rankDiff;
    if (left.canonical !== right.canonical) return left.canonical ? -1 : 1;
    const leftGenerated = Date.parse(left.generated_at ?? '');
    const rightGenerated = Date.parse(right.generated_at ?? '');
    const generatedDiff =
      (Number.isFinite(rightGenerated) ? rightGenerated : 0)
      - (Number.isFinite(leftGenerated) ? leftGenerated : 0);
    if (generatedDiff !== 0) return generatedDiff;
    return String(left.title ?? left.artifact_id).localeCompare(
      String(right.title ?? right.artifact_id),
    );
  })[0] ?? null;
}

function MetricBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">{label}</div>
      <div className="mt-1 text-lg font-mono text-white">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-neutral-500">{sub}</div>}
    </div>
  );
}

function CandidateCompactRow({
  candidate,
  selected,
  onSelect,
}: {
  candidate: ResearchCandidate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-xl border px-3 py-3 text-left transition-colors',
        selected
          ? 'border-cyan-400/30 bg-cyan-500/[0.06]'
          : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-white">{candidate.candidate_id}</span>
            <GlassBadge variant="default">{candidate.model_family}</GlassBadge>
            <GlassBadge variant={statusTone(candidate.selection_status)}>
              {candidate.selection_status}
            </GlassBadge>
            {!!candidate.robustness_score_normalized && (
              <GlassBadge variant="info">
                robust {candidate.robustness_score_normalized.toFixed(0)}
              </GlassBadge>
            )}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            OOS {fmtSigned(candidate.walk_forward_metrics.median_oos_pnl_bps, 1, ' bps')}
            {' · '}
            PF {candidate.walk_forward_metrics.aggregate_pf.toFixed(2)}
            {' · '}
            Trades {candidate.walk_forward_metrics.aggregate_trades}
            {' · '}
            Artifacts {candidate.artifacts.length}
          </div>
        </div>
        <div className="text-right text-xs">
          <div className="text-neutral-500">Runtime parity</div>
          <div className="font-mono text-white">
            {candidate.validation_statuses.runtime_parity ?? 'pending'}
          </div>
        </div>
      </div>
    </button>
  );
}

function CandidateDetail({ candidate }: { candidate: ResearchCandidate | null }) {
  if (!candidate) return null;
  const rejections = candidate.diagnostics.top_rejections.slice(0, 6);
  const params = Object.entries(candidate.params).slice(0, 10);
  const gates = candidate.validations;

  return (
    <GlassCard className="h-full">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-xs uppercase tracking-[0.16em] text-neutral-400">
              Candidate Detail
            </div>
            <GlassBadge variant="info">{candidate.candidate_id}</GlassBadge>
            <GlassBadge variant="default">{candidate.model_family}</GlassBadge>
            <GlassBadge variant={statusTone(candidate.selection_status)}>
              {candidate.selection_status}
            </GlassBadge>
            {!!candidate.research_mode && <GlassBadge variant="default">{candidate.research_mode}</GlassBadge>}
            {!!candidate.logic_certainty && <GlassBadge variant="info">{candidate.logic_certainty}</GlassBadge>}
          </div>
          <div className="mt-2 text-sm text-neutral-300">
            {candidate.market} · stage {candidate.selection_stage}
          </div>
        </div>
        <div className="text-right text-xs">
          <div className="text-neutral-500">Robustness</div>
          <div className="font-mono text-white">
            {candidate.robustness_score_normalized?.toFixed(1) ?? 'n/a'}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <MetricBox label="PnL FS" value={fmtSigned(candidate.full_sample_metrics.gross_pnl_bps, 1, ' bps')} />
        <MetricBox label="PF FS" value={candidate.full_sample_metrics.profit_factor.toFixed(2)} />
        <MetricBox label="Median OOS" value={fmtSigned(candidate.walk_forward_metrics.median_oos_pnl_bps, 1, ' bps')} />
        <MetricBox label="Trades" value={String(candidate.full_sample_metrics.total_trades)} />
      </div>

      <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
            Validation Stages
          </div>
          <div className="space-y-2 text-xs">
            {gates.map((gate) => (
              <div key={gate.stage} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-300">{gate.stage}</span>
                  <GlassBadge variant={statusTone(gate.status)}>{gate.status}</GlassBadge>
                </div>
                {!!gate.blocking_reasons.length && (
                  <div className="mt-2 text-neutral-500">{gate.blocking_reasons.join(' · ')}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
            Top Rejections
          </div>
          <div className="space-y-2">
            {rejections.length ? rejections.map((item) => (
              <div key={item.reason} className="flex items-center justify-between text-xs">
                <span className="text-neutral-300">{item.reason}</span>
                <span className="font-mono text-neutral-500">
                  {item.count} · {(item.share * 100).toFixed(0)}%
                </span>
              </div>
            )) : <div className="text-xs text-neutral-500">Aucune raison de rejet.</div>}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
            Drift
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">OOS / FS</span>
              <span className="font-mono text-white">
                {candidate.diagnostics.drift.oos_vs_full_sample_ratio?.toFixed(2) ?? 'n/a'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Delta OOS - FS</span>
              <span className="font-mono text-white">
                {fmtSigned(candidate.diagnostics.drift.oos_minus_full_sample_bps, 1, ' bps')}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
            Significance
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Sample quality</span>
              <span className="font-mono text-white">
                {String(candidate.statistical_significance.sample_quality ?? 'n/a')}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Expectancy</span>
              <span className="font-mono text-white">
                {fmtSigned(candidate.full_sample_metrics.expectancy_bps, 2, ' bps')}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
            Economics
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">RT cost</span>
              <span className="font-mono text-white">
                {fmtSigned(candidate.economics.round_trip_cost_pips, 2, ' pips')}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Net edge proxy</span>
              <span className="font-mono text-white">
                {fmtSigned(candidate.economics.net_edge_bps_proxy, 2, ' bps')}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
          Params
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {params.map(([key, value]) => (
            <div key={key} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <div className="text-neutral-500">{key}</div>
              <div className="font-mono text-neutral-200">{String(value)}</div>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}

function CampaignsPanel({
  campaigns,
  recommendedCandidateId,
}: {
  campaigns: ResearchCampaign[];
  recommendedCandidateId: string | null | undefined;
}) {
  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 xl:col-span-4">
        <GlassCard className="h-full">
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
            Research Scope
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MetricBox label="Campaigns" value={String(campaigns.length)} />
            <MetricBox label="Champion" value={recommendedCandidateId ?? 'n/a'} />
          </div>
        </GlassCard>
      </div>

      <div className="col-span-12 xl:col-span-8">
        <GlassCard>
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
            Campaign Registry
          </div>
          <div className="space-y-2">
            {campaigns.length ? campaigns.map((campaign) => (
              <div
                key={campaign.campaign_id}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm text-white">{campaign.campaign_id}</span>
                      {campaign.profile && <GlassBadge variant="default">{campaign.profile}</GlassBadge>}
                      {campaign.engine_version && <GlassBadge variant="info">{campaign.engine_version}</GlassBadge>}
                      {campaign.status && (
                        <GlassBadge variant={statusTone(campaign.status)}>
                          {campaign.status}
                        </GlassBadge>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {campaign.generated_at ?? 'n/a'} · {campaign.dataset?.start ?? 'n/a'} {'->'} {campaign.dataset?.end ?? 'n/a'}
                    </div>
                    {!!campaign.progress && (
                      <div className="mt-2 text-xs text-neutral-400">
                        {`Variants ${campaign.progress.completed_variants ?? 0}/${campaign.progress.discovered_variants ?? campaign.variant_count}`}
                        {campaign.progress.current_variant
                          ? ` · current ${String(campaign.progress.current_variant)}`
                          : ''}
                        {campaign.progress.best_partial_variant_id
                          ? ` · best partial ${String(campaign.progress.best_partial_variant_id)}`
                          : ''}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs min-w-[280px]">
                    <MetricBox
                      label="Variants"
                      value={
                        campaign.progress?.discovered_variants != null
                          ? `${campaign.progress.completed_variants ?? 0}/${campaign.progress.discovered_variants}`
                          : String(campaign.variant_count)
                      }
                    />
                    <MetricBox label="Retained" value={String(campaign.retained_count)} />
                    <MetricBox label="Champion" value={campaign.recommended_candidate_id ?? 'n/a'} />
                  </div>
                </div>
                {!!campaign.blocking_reasons?.length && (
                  <div className="mt-3 text-xs text-amber-200">
                    {campaign.blocking_reasons.join(' · ')}
                  </div>
                )}
              </div>
            )) : (
              <EmptyState title="Aucune campagne" message="La stratégie n'a pas encore de campagne canonique disponible." />
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function WalkForwardPanel({ candidate }: { candidate: ResearchCandidate | null }) {
  const folds = candidate?.walk_forward_metrics.folds_detail ?? [];

  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 xl:col-span-4">
        <GlassCard className="h-full">
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
            Walk-Forward Summary
          </div>
          {candidate ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <GlassBadge variant="info">{candidate.candidate_id}</GlassBadge>
                <GlassBadge variant="default">{candidate.model_family}</GlassBadge>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MetricBox label="Folds" value={String(candidate.walk_forward_metrics.folds)} />
                <MetricBox label="Profitable" value={pct(candidate.walk_forward_metrics.profitable_share)} />
                <MetricBox label="Median OOS" value={fmtSigned(candidate.walk_forward_metrics.median_oos_pnl_bps, 1, ' bps')} />
                <MetricBox label="Agg PF" value={candidate.walk_forward_metrics.aggregate_pf.toFixed(2)} />
              </div>
            </div>
          ) : (
            <EmptyState title="Aucun candidat" message="Selectionner un candidat pour voir ses folds OOS." />
          )}
        </GlassCard>
      </div>

      <div className="col-span-12 xl:col-span-8">
        <GlassCard>
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
            Fold Detail
          </div>
          {!candidate ? (
            <EmptyState title="Walk-forward vide" message="Le panel detaille apparait apres selection d'un candidat." />
          ) : !folds.length ? (
            <EmptyState title="Pas de folds detailles" message="Le rapport courant ne contient pas encore de detail fold par fold." />
          ) : (
            <div className="space-y-2">
              {folds.map((fold, index) => {
                const pnl = Number(fold.gross_pnl_bps ?? 0);
                const trades = Number(fold.total_trades ?? 0);
                const pf = Number(fold.profit_factor ?? 0);
                return (
                  <div
                    key={`fold-${index}`}
                    className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <GlassBadge variant="default">fold {index + 1}</GlassBadge>
                        <GlassBadge variant={pnl >= 0 ? 'success' : 'danger'}>
                          {fmtSigned(pnl, 1, ' bps')}
                        </GlassBadge>
                      </div>
                      <div className="text-xs text-neutral-500">
                        Trades {trades} · PF {pf.toFixed(2)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

function PromotionPanel({
  promotion,
  candidate,
}: {
  promotion: S2ResearchDeskResponse['promotion'] | null | undefined;
  candidate: ResearchCandidate | null;
}) {
  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 xl:col-span-5">
        <GlassCard className="h-full">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-neutral-400">
                Promotion Status
              </div>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <GlassBadge variant="info">{promotion?.owner_service ?? 'n/a'}</GlassBadge>
                <GlassBadge variant={statusTone(promotion?.status ?? 'default')}>
                  {promotion?.status ?? 'n/a'}
                </GlassBadge>
              </div>
            </div>
            <div className="text-right text-xs">
              <div className="text-neutral-500">Config version</div>
              <div className="font-mono text-white">{promotion?.runtime_config_version ?? 'n/a'}</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 text-xs">
            <MetricBox label="Recommended" value={promotion?.recommended_candidate_id ?? 'n/a'} />
            <MetricBox label="Runner-up" value={promotion?.runner_up_candidate_id ?? 'n/a'} />
            <MetricBox label="Runtime candidate" value={promotion?.runtime_candidate_id ?? 'unresolved'} />
            <MetricBox label="Rollback" value={promotion?.rollback_target ?? 'n/a'} />
          </div>
        </GlassCard>
      </div>

      <div className="col-span-12 xl:col-span-7">
        <GlassCard className="h-full">
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
            Decision & Manifest
          </div>
          {candidate && (
            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <GlassBadge variant="info">{candidate.candidate_id}</GlassBadge>
              <GlassBadge variant="default">{candidate.model_family}</GlassBadge>
              <GlassBadge variant={statusTone(candidate.promotion_status)}>
                {candidate.promotion_status}
              </GlassBadge>
            </div>
          )}
          {promotion?.manifest ? (
            <div className="space-y-2 text-xs">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-400">Manifest candidate</span>
                  <span className="font-mono text-white">{promotion.manifest.candidate_id}</span>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-400">Runtime target</span>
                  <span className="font-mono text-white">{promotion.manifest.runtime_target}</span>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-400">Config hash</span>
                  <span className="font-mono text-white">{promotion.manifest.config_hash}</span>
                </div>
              </div>
              {!!promotion.blocking_reasons?.length && (
                <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.06] px-4 py-3 text-amber-100">
                  {promotion.blocking_reasons.join(' · ')}
                </div>
              )}
            </div>
          ) : (
            <EmptyState title="Manifest absent" message="La promotion reste bloquee tant qu'aucun manifest versionne n'est disponible." />
          )}
        </GlassCard>
      </div>
    </div>
  );
}

function PaperMatchPanel({
  paperMatch,
}: {
  paperMatch: ResearchPaperMatchResponse | null | undefined;
}) {
  const observation = paperMatch?.paper_observation;
  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 xl:col-span-5">
        <GlassCard className="h-full">
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
            Runtime Parity
          </div>
          <div className="grid grid-cols-1 gap-3">
            <MetricBox label="Status" value={paperMatch?.status ?? 'n/a'} />
            <MetricBox label="Runtime target" value={paperMatch?.runtime_target ?? 'n/a'} />
            <MetricBox label="Runtime candidate" value={paperMatch?.runtime_candidate_id ?? 'n/a'} />
          </div>
        </GlassCard>
      </div>
      <div className="col-span-12 xl:col-span-7">
        <GlassCard className="h-full">
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
            Paper Observation
          </div>
          {observation ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <GlassBadge variant={statusTone(observation.status)}>{observation.status}</GlassBadge>
                <GlassBadge variant={statusTone(observation.drift_status)}>{observation.drift_status}</GlassBadge>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                {observation.blocking_reasons.length
                  ? observation.blocking_reasons.join(' · ')
                  : 'Aucun blocage paper actif.'}
              </div>
            </div>
          ) : (
            <EmptyState title="Observation absente" message="Aucune telemetrie paper n'est encore branchee sur ce desk." />
          )}
        </GlassCard>
      </div>
    </div>
  );
}

function RunsPanel({ runs }: { runs: ResearchRun[] }) {
  return (
    <GlassCard>
      <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
        Diagnostic Runs
      </div>
      {runs.length ? (
        <div className="space-y-2">
          {runs.map((run) => (
            <div
              key={run.run_id}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-mono text-white">{run.run_id}</div>
                  <div className="mt-1 text-neutral-500">{run.label}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <GlassBadge variant="default">{run.stage}</GlassBadge>
                  <GlassBadge variant={statusTone(run.status)}>{run.status}</GlassBadge>
                  <GlassBadge variant={run.promotable ? 'danger' : 'info'}>
                    {run.promotable ? 'promotable' : 'non-promotable'}
                  </GlassBadge>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="Aucun run" message="Les runs de diagnostic vivent ici et ne sont jamais promotables." />
      )}
    </GlassCard>
  );
}

function LaunchPanel({
  launchCapabilities,
}: {
  launchCapabilities: ResearchLaunchCapabilitiesResponse | null | undefined;
}) {
  return (
    <GlassCard>
      <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
        Launch Capabilities
      </div>
      {launchCapabilities ? (
        <div className="space-y-3">
          {!!launchCapabilities.blocking_reasons.length && (
            <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.06] px-4 py-3 text-xs text-amber-100">
              {launchCapabilities.blocking_reasons.join(' · ')}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {launchCapabilities.launch_intents.map((intent) => (
              <div
                key={intent.intent}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-white">{intent.label}</span>
                  <GlassBadge variant={intent.enabled ? 'success' : 'warning'}>
                    {intent.enabled ? 'enabled' : 'blocked'}
                  </GlassBadge>
                </div>
                <div className="mt-2 text-xs text-neutral-500">
                  Launch reste contextuel et secondaire. La gouvernance du pipeline reste canonique.
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState title="Launch indisponible" message="Les capacites de lancement ne sont pas disponibles pour cette strategie." />
      )}
    </GlassCard>
  );
}

export function StrategyPipelineDeskView({
  payload,
  title,
  badgeLabel,
  paperMatch,
  runs,
  launchCapabilities,
  activeTab: activeTabProp,
  onTabChange,
  selectedCandidateId: selectedCandidateIdProp,
  onSelectCandidate,
  selectedArtifactId: selectedArtifactIdProp,
  onSelectArtifact,
  candidateFilter: candidateFilterProp,
  onCandidateFilterChange,
  showStageTabs = true,
  showArtifactInspector = true,
}: {
  payload: S2ResearchDeskResponse | null;
  title: string;
  badgeLabel?: string | null;
  paperMatch?: ResearchPaperMatchResponse | null;
  runs?: ResearchRun[];
  launchCapabilities?: ResearchLaunchCapabilitiesResponse | null;
  activeTab?: StrategyPipelineDeskTab;
  onTabChange?: (tab: StrategyPipelineDeskTab) => void;
  selectedCandidateId?: string | null;
  onSelectCandidate?: (candidateId: string | null) => void;
  selectedArtifactId?: string | null;
  onSelectArtifact?: (artifactId: string | null) => void;
  candidateFilter?: CandidateFilter;
  onCandidateFilterChange?: (filter: CandidateFilter) => void;
  showStageTabs?: boolean;
  showArtifactInspector?: boolean;
}) {
  const [internalActiveTab, setInternalActiveTab] = useState<StrategyPipelineDeskTab>('campaigns');
  const [internalCandidateFilter, setInternalCandidateFilter] = useState<CandidateFilter>('all');
  const [internalSelectedCandidateId, setInternalSelectedCandidateId] = useState<string | null>(null);
  const [internalSelectedArtifactId, setInternalSelectedArtifactId] = useState<string | null>(null);

  const activeTab = activeTabProp ?? internalActiveTab;
  const setActiveTab = onTabChange ?? setInternalActiveTab;
  const candidateFilter = candidateFilterProp ?? internalCandidateFilter;
  const setCandidateFilter = onCandidateFilterChange ?? setInternalCandidateFilter;
  const selectedCandidateId = selectedCandidateIdProp ?? internalSelectedCandidateId;
  const setSelectedCandidateId = onSelectCandidate ?? setInternalSelectedCandidateId;
  const selectedArtifactId = selectedArtifactIdProp ?? internalSelectedArtifactId;
  const setSelectedArtifactId = onSelectArtifact ?? setInternalSelectedArtifactId;

  const candidates = payload?.candidates ?? [];
  const campaigns = payload?.campaigns ?? [];
  const promotion = payload?.promotion;
  const stressContract = payload?.stress_contract;

  useEffect(() => {
    if (!selectedCandidateId && candidates.length) {
      setSelectedCandidateId(
        promotion?.recommended_candidate_id ?? candidates[0]?.candidate_id ?? null
      );
    }
  }, [candidates, promotion?.recommended_candidate_id, selectedCandidateId, setSelectedCandidateId]);

  const filteredCandidates = useMemo(() => {
    return candidates.filter((candidate) => {
      if (candidateFilter === 'retained') {
        return (
          candidate.validation.full_sample.retained
          && candidate.validation.walk_forward.retained
          && candidate.validation.stress.retained
        );
      }
      if (candidateFilter === 'rejected') return candidate.selection_status === 'rejected';
      if (candidateFilter === 'recommended') {
        return candidate.candidate_id === promotion?.recommended_candidate_id;
      }
      if (candidateFilter === 'runtime') {
        return candidate.candidate_id === promotion?.runtime_candidate_id;
      }
      return true;
    });
  }, [candidateFilter, candidates, promotion?.recommended_candidate_id, promotion?.runtime_candidate_id]);

  const selectedCandidate = useMemo(() => {
    const source = filteredCandidates.length ? filteredCandidates : candidates;
    return source.find((row) => row.candidate_id === selectedCandidateId) ?? source[0] ?? null;
  }, [candidates, filteredCandidates, selectedCandidateId]);

  const allArtifacts = useMemo(
    () => candidates.flatMap((candidate) => candidate.artifacts ?? []),
    [candidates]
  );
  const selectedArtifact = useMemo<ResearchArtifactRef | null>(() => {
    if (selectedArtifactId) {
      const explicitMatch = allArtifacts.find((artifact) => artifact.artifact_id === selectedArtifactId);
      if (explicitMatch) return explicitMatch;
    }
    const candidateArtifacts = selectedCandidate?.artifacts ?? [];
    return selectPreferredArtifact(candidateArtifacts)
      ?? selectPreferredArtifact(allArtifacts);
  }, [allArtifacts, selectedArtifactId, selectedCandidate]);

  useEffect(() => {
    if (!selectedArtifact && allArtifacts.length) {
      const fallbackArtifact = selectPreferredArtifact(allArtifacts);
      setSelectedArtifactId(fallbackArtifact?.artifact_id ?? allArtifacts[0].artifact_id);
      return;
    }
    if (selectedArtifact && selectedArtifactId !== selectedArtifact.artifact_id) {
      setSelectedArtifactId(selectedArtifact.artifact_id);
    }
  }, [allArtifacts, selectedArtifact, selectedArtifactId, setSelectedArtifactId]);

  if (!payload?.available && !launchCapabilities) {
    return (
      <GlassCard variant="warning">
        <EmptyState
          title={`${title} indisponible`}
          message="Aucune campagne canonique n'est encore disponible pour cette strategie."
        />
      </GlassCard>
    );
  }

  return (
    <div className="space-y-3">
      <GlassCard>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-xs uppercase tracking-[0.16em] text-neutral-400">
              {title}
            </div>
            {badgeLabel && <GlassBadge variant="info">{badgeLabel}</GlassBadge>}
            {campaigns[0]?.profile && <GlassBadge variant="default">{campaigns[0].profile}</GlassBadge>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <MetricBox label="Candidates" value={String(candidates.length)} />
            <MetricBox label="Champion" value={promotion?.recommended_candidate_id ?? 'n/a'} />
            <MetricBox
              label="Runtime"
              value={promotion?.runtime_candidate_id ?? 'unresolved'}
              sub={promotion?.status ?? 'n/a'}
            />
            <MetricBox
              label="Stress Suite"
              value={stressContract?.suite_version ?? 'n/a'}
              sub={`${stressContract?.scenarios?.length ?? 0} scenarios`}
            />
          </div>
        </div>
      </GlassCard>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        {showStageTabs ? (
          <SegmentedControl
            options={DESK_TABS}
            value={activeTab}
            onChange={(value) => setActiveTab(value as StrategyPipelineDeskTab)}
          />
        ) : (
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">
            Stage actif · {DESK_TABS.find((tab) => tab.value === activeTab)?.label ?? activeTab}
          </div>
        )}
        {(activeTab === 'candidates' || activeTab === 'walkforward') && (
          <SegmentedControl
            options={FILTER_OPTIONS}
            value={candidateFilter}
            onChange={(value) => setCandidateFilter(value as CandidateFilter)}
          />
        )}
      </div>

      {activeTab === 'campaigns' && (
        <CampaignsPanel
          campaigns={campaigns}
          recommendedCandidateId={promotion?.recommended_candidate_id}
        />
      )}

      {activeTab === 'candidates' && (
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 xl:col-span-5">
            <GlassCard>
              <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
                Candidate Leaderboard
              </div>
              {filteredCandidates.length ? (
                <div className="space-y-2">
                  {filteredCandidates.slice(0, 20).map((candidate) => (
                    <CandidateCompactRow
                      key={candidate.candidate_id}
                      candidate={candidate}
                      selected={selectedCandidate?.candidate_id === candidate.candidate_id}
                      onSelect={() => setSelectedCandidateId(candidate.candidate_id)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState title="Aucun candidat" message="Le filtre courant ne retourne aucun candidat." />
              )}
            </GlassCard>
          </div>
          <div className="col-span-12 xl:col-span-7">
            <div className="space-y-3">
              <CandidateDetail candidate={selectedCandidate} />
              {!!selectedCandidate?.artifacts.length && (
                <GlassCard>
                  <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
                    Candidate Artifacts
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedCandidate.artifacts.map((artifact) => (
                      <button
                        key={artifact.artifact_id}
                        type="button"
                        onClick={() => setSelectedArtifactId(artifact.artifact_id)}
                        className={cn(
                          'rounded-lg border px-3 py-2 text-xs transition-colors',
                          selectedArtifact?.artifact_id === artifact.artifact_id
                            ? 'border-cyan-400/30 bg-cyan-500/[0.08] text-cyan-100'
                            : 'border-white/10 bg-white/[0.03] text-neutral-300 hover:bg-white/[0.06]'
                        )}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{artifact.title ?? artifact.phase}</span>
                          <GlassBadge variant={statusTone(artifact.status)}>
                            {artifact.status}
                          </GlassBadge>
                        </div>
                      </button>
                    ))}
                  </div>
                </GlassCard>
              )}
              {showArtifactInspector && <ResearchArtifactInspector artifact={selectedArtifact} />}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'walkforward' && <WalkForwardPanel candidate={selectedCandidate} />}
      {activeTab === 'promotion' && <PromotionDesk promotion={promotion} candidate={selectedCandidate} />}
      {activeTab === 'paper_match' && <PaperMatchDesk paperMatch={paperMatch} />}
      {activeTab === 'runs' && (
        <div className={cn('grid gap-3', showArtifactInspector ? 'grid-cols-12' : 'grid-cols-1')}>
          <div className={showArtifactInspector ? 'col-span-12 xl:col-span-5' : ''}>
            <RunsDesk
              runs={runs ?? payload?.runs ?? []}
              selectedArtifactId={selectedArtifact?.artifact_id ?? null}
              onSelectArtifact={setSelectedArtifactId}
            />
          </div>
          {showArtifactInspector && (
            <div className="col-span-12 xl:col-span-7">
              <ResearchArtifactInspector artifact={selectedArtifact} />
            </div>
          )}
        </div>
      )}
      {activeTab === 'launch' && <LaunchPanel launchCapabilities={launchCapabilities} />}
    </div>
  );
}
