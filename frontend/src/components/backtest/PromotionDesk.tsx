import React from 'react';

import type { ResearchCandidate, S2ResearchDeskResponse } from '../../lib/api';
import { EmptyState, GlassBadge, GlassCard } from '../ui/glass';

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
    || status === 'pending'
  ) {
    return 'warning';
  }
  if (status === 'rejected' || status === 'runtime_mismatch' || status === 'blocked') {
    return 'danger';
  }
  return 'info';
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">{label}</div>
      <div className="mt-1 text-lg font-mono text-white">{value}</div>
    </div>
  );
}

export function PromotionDesk({
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
