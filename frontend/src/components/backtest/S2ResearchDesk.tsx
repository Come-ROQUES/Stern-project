import React, { useEffect, useMemo, useState } from 'react';

import {
  type ResearchCandidate,
  type ResearchCampaign,
  type S2ResearchDeskResponse,
} from '../../lib/api';
import { cn } from '../../lib/utils';
import { EmptyState, GlassBadge, GlassCard, SegmentedControl } from '../ui/glass';

type DeskTab = 'campaigns' | 'candidates' | 'walkforward' | 'promotion';
type CandidateFilter = 'all' | 'retained' | 'rejected' | 'recommended' | 'runtime';

const DESK_TABS: Array<{ value: DeskTab; label: string }> = [
  { value: 'campaigns', label: 'Campaigns' },
  { value: 'candidates', label: 'Candidates' },
  { value: 'walkforward', label: 'Walk-Forward' },
  { value: 'promotion', label: 'Promotion' },
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
  ) {
    return 'success';
  }
  if (
    status === 'needs_stress'
    || status === 'paper_candidate_selected'
    || status === 'runtime_unresolved'
  ) {
    return 'warning';
  }
  if (status === 'rejected' || status === 'runtime_mismatch') return 'danger';
  return 'info';
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
            {candidate.promotion_status !== 'not_promoted' && (
              <GlassBadge variant={statusTone(candidate.promotion_status)}>
                {candidate.promotion_status}
              </GlassBadge>
            )}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            OOS {fmtSigned(candidate.walk_forward_metrics.median_oos_pnl_bps, 1, ' bps')}
            {' · '}
            PF {candidate.walk_forward_metrics.aggregate_pf.toFixed(2)}
            {' · '}
            Trades {candidate.walk_forward_metrics.aggregate_trades}
          </div>
        </div>
        <div className="text-right text-xs">
          <div className="text-neutral-500">Full sample</div>
          <div className="font-mono text-white">
            {fmtSigned(candidate.full_sample_metrics.gross_pnl_bps, 1, ' bps')}
          </div>
        </div>
      </div>
    </button>
  );
}

function CandidateDetail({ candidate }: { candidate: ResearchCandidate | null }) {
  if (!candidate) return null;
  const rejections = candidate.diagnostics.top_rejections.slice(0, 6);
  const params = Object.entries(candidate.params).slice(0, 8);
  const stressScenarios = candidate.stress_metrics.scenarios ?? [];
  const gates = [
    { key: 'eligibility', label: 'Eligibility', retained: candidate.validation.eligibility.retained, failures: candidate.validation.eligibility.failures },
    { key: 'full_sample', label: 'Full sample', retained: candidate.validation.full_sample.retained, failures: candidate.validation.full_sample.failures },
    { key: 'walk_forward', label: 'Walk-forward', retained: candidate.validation.walk_forward.retained, failures: candidate.validation.walk_forward.failures },
    { key: 'stress', label: 'Stress', retained: candidate.validation.stress.retained, failures: candidate.validation.stress.failures },
  ];

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
          </div>
          <div className="mt-2 text-sm text-neutral-300">
            {candidate.market} · stage {candidate.selection_stage}
          </div>
        </div>
        <div className="text-right text-xs">
          <div className="text-neutral-500">Promotion</div>
          <div className="text-white font-mono">{candidate.promotion_status}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <MetricBox label="PnL FS" value={fmtSigned(candidate.full_sample_metrics.gross_pnl_bps, 1, ' bps')} />
        <MetricBox label="PF FS" value={candidate.full_sample_metrics.profit_factor.toFixed(2)} />
        <MetricBox label="Median OOS" value={fmtSigned(candidate.walk_forward_metrics.median_oos_pnl_bps, 1, ' bps')} />
        <MetricBox label="Trades OOS" value={String(candidate.walk_forward_metrics.aggregate_trades)} />
      </div>

      <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
            Selection Funnel
          </div>
          <div className="space-y-2 text-xs">
            {gates.map((gate) => (
              <div key={gate.key} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-300">{gate.label}</span>
                  <GlassBadge variant={gate.retained ? 'success' : 'warning'}>
                    {gate.retained ? 'pass' : 'fail'}
                  </GlassBadge>
                </div>
                {!!gate.failures.length && (
                  <div className="mt-2 text-neutral-500">
                    {gate.failures.join(' · ')}
                  </div>
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

      <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
            Drift Train to OOS
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Full-sample pnl</span>
              <span className="font-mono text-white">
                {fmtSigned(candidate.diagnostics.drift.full_sample_pnl_bps, 1, ' bps')}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Median OOS pnl</span>
              <span className="font-mono text-white">
                {fmtSigned(candidate.diagnostics.drift.median_oos_pnl_bps, 1, ' bps')}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Delta OOS - FS</span>
              <span className="font-mono text-white">
                {fmtSigned(candidate.diagnostics.drift.oos_minus_full_sample_bps, 1, ' bps')}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">OOS / FS</span>
              <span className="font-mono text-white">
                {candidate.diagnostics.drift.oos_vs_full_sample_ratio?.toFixed(2) ?? 'n/a'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Entry freq / 1k pts</span>
              <span className="font-mono text-white">
                {candidate.diagnostics.entry_frequency_per_1k_points?.toFixed(2) ?? 'n/a'}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
            Stress Scenarios
          </div>
          {stressScenarios.length ? (
            <div className="space-y-2 text-xs">
              {stressScenarios.map((scenario) => (
                <div
                  key={scenario.scenario_id}
                  className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-neutral-300">{scenario.label}</span>
                      <GlassBadge variant={scenario.retained ? 'success' : 'warning'}>
                        {scenario.retained ? 'pass' : 'fail'}
                      </GlassBadge>
                    </div>
                    <span className="font-mono text-neutral-500">
                      {fmtSigned(scenario.metrics.gross_pnl_bps, 1, ' bps')}
                    </span>
                  </div>
                  <div className="mt-2 text-neutral-500">
                    trades {scenario.metrics.total_trades} · PF {scenario.metrics.profit_factor.toFixed(2)}
                    {' · '}
                    DD {scenario.metrics.max_drawdown_bps.toFixed(1)} bps
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-neutral-500">Aucun scenario stress detaille.</div>
          )}
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
            {campaigns.map((campaign) => (
              <div
                key={campaign.campaign_id}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm text-white">{campaign.campaign_id}</span>
                      {campaign.profile && <GlassBadge variant="default">{campaign.profile}</GlassBadge>}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {campaign.generated_at ?? 'n/a'} · {campaign.dataset?.start ?? 'n/a'} {'->'} {campaign.dataset?.end ?? 'n/a'}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs min-w-[280px]">
                    <MetricBox label="Variants" value={String(campaign.variant_count)} />
                    <MetricBox label="Retained" value={String(campaign.retained_count)} />
                    <MetricBox label="Champion" value={campaign.recommended_candidate_id ?? 'n/a'} />
                  </div>
                </div>
              </div>
            ))}
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
                <GlassBadge variant="info">{promotion?.owner_service ?? 's2-pairs-a1'}</GlassBadge>
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
            <MetricBox label="Runtime candidate" value={promotion?.runtime_candidate_id ?? 'unresolved'} />
            <MetricBox label="Runtime model family" value={promotion?.runtime_model_family ?? 'n/a'} />
          </div>
        </GlassCard>
      </div>

      <div className="col-span-12 xl:col-span-7">
        <GlassCard className="h-full">
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
            Champion vs Runtime
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
          {promotion?.diff_vs_recommended?.length ? (
            <div className="space-y-2">
              {promotion.diff_vs_recommended.slice(0, 10).map((diff) => (
                <div
                  key={`${diff.candidate_key}-${diff.runtime_key}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs"
                >
                  <span className="text-neutral-300">{diff.candidate_key}</span>
                  <span className="font-mono text-neutral-500">
                    {diff.expected} {'->'} {diff.actual || 'missing'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              variant="info"
              title="Runtime aligne"
              message="Le preset topologie versionne correspond deja au champion recommande."
            />
          )}
        </GlassCard>
      </div>
    </div>
  );
}

export function S2ResearchDesk({ payload }: { payload: S2ResearchDeskResponse | null }) {
  return <StrategyResearchDeskView payload={payload} title="S2 Research Desk" badgeLabel="AUDNZD" />;
}

export function StrategyResearchDeskView({
  payload,
  title,
  badgeLabel,
}: {
  payload: S2ResearchDeskResponse | null;
  title: string;
  badgeLabel?: string | null;
}) {
  const candidates = payload?.candidates ?? [];
  const campaigns = payload?.campaigns ?? [];
  const promotion = payload?.promotion;
  const stressContract = payload?.stress_contract;

  const [activeTab, setActiveTab] = useState<DeskTab>('campaigns');
  const [candidateFilter, setCandidateFilter] = useState<CandidateFilter>('all');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    payload?.promotion?.recommended_candidate_id ?? candidates[0]?.candidate_id ?? null
  );

  useEffect(() => {
    if (!selectedCandidateId && candidates.length) {
      setSelectedCandidateId(
        payload?.promotion?.recommended_candidate_id ?? candidates[0]?.candidate_id ?? null
      );
    }
  }, [candidates, payload?.promotion?.recommended_candidate_id, selectedCandidateId]);

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
    return (
      source.find((row) => row.candidate_id === selectedCandidateId)
      ?? source[0]
      ?? null
    );
  }, [candidates, filteredCandidates, selectedCandidateId]);

  useEffect(() => {
    if (selectedCandidate && selectedCandidate.candidate_id !== selectedCandidateId) {
      setSelectedCandidateId(selectedCandidate.candidate_id);
    }
  }, [selectedCandidate, selectedCandidateId]);

  if (!payload?.available) return null;

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
        <SegmentedControl options={DESK_TABS} value={activeTab} onChange={setActiveTab} />
        {(activeTab === 'candidates' || activeTab === 'walkforward') && (
          <SegmentedControl
            options={FILTER_OPTIONS}
            value={candidateFilter}
            onChange={setCandidateFilter}
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
                  {filteredCandidates.slice(0, 16).map((candidate) => (
                    <CandidateCompactRow
                      key={candidate.candidate_id}
                      candidate={candidate}
                      selected={selectedCandidate?.candidate_id === candidate.candidate_id}
                      onSelect={() => setSelectedCandidateId(candidate.candidate_id)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Aucun candidat"
                  message="Le filtre courant ne retourne aucun candidat."
                />
              )}
            </GlassCard>
          </div>

          <div className="col-span-12 xl:col-span-7">
            <CandidateDetail candidate={selectedCandidate} />
          </div>
        </div>
      )}

      {activeTab === 'walkforward' && <WalkForwardPanel candidate={selectedCandidate} />}

      {activeTab === 'promotion' && (
        <PromotionPanel promotion={promotion} candidate={selectedCandidate} />
      )}
    </div>
  );
}
