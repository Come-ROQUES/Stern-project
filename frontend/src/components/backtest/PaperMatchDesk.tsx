import React, { useEffect, useState } from 'react';

import type { ParityDailyReport, ParityHistoryResponse, ResearchPaperMatchResponse } from '../../lib/api';
import { api } from '../../lib/api';
import { useViewActivity } from '../../lib/viewActivity';
import { EmptyState, GlassBadge, GlassCard } from '../ui/glass';

const PARITY_TARGET = 0.9;

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

function parityTone(rate: number | null): 'success' | 'warning' | 'danger' | 'default' {
  if (rate == null) return 'default';
  if (rate >= PARITY_TARGET) return 'success';
  if (rate >= 0.7) return 'warning';
  return 'danger';
}

function fmtPct(rate: number | null): string {
  if (rate == null) return 'n/a';
  return `${(rate * 100).toFixed(1)}%`;
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">{label}</div>
      <div className="mt-1 text-lg font-mono text-white">{value}</div>
    </div>
  );
}

function ParityGateSection() {
  const viewActive = useViewActivity();
  const [history, setHistory] = useState<ParityDailyReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!viewActive) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await api.getParityHistory(7) as ParityHistoryResponse;
        if (!cancelled) setHistory(resp.reports ?? []);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [viewActive]);

  if (loading) {
    return (
      <GlassCard>
        <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
          Daily Parity Gate
        </div>
        <div className="text-neutral-500 text-sm">Chargement...</div>
      </GlassCard>
    );
  }

  if (!history.length) {
    return (
      <GlassCard>
        <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
          Daily Parity Gate
        </div>
        <EmptyState
          title="Aucun rapport"
          message="Le cron daily_parity_report.sh n'a pas encore produit de rapport."
        />
      </GlassCard>
    );
  }

  return (
    <GlassCard>
      <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
        Daily Parity Gate (7 derniers jours)
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10 text-neutral-500 uppercase tracking-wider">
              <th className="text-left py-2 pr-4">Date</th>
              <th className="text-left py-2 pr-4">Strategie</th>
              <th className="text-right py-2 pr-4">Match Rate</th>
              <th className="text-right py-2 pr-4">BT</th>
              <th className="text-right py-2 pr-4">Live</th>
              <th className="text-right py-2 pr-4">Matched</th>
              <th className="text-right py-2 pr-4">PnL Delta</th>
              <th className="text-left py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {history.map((report) => {
              if (report.error) {
                return (
                  <tr key={report.date} className="border-b border-white/5">
                    <td className="py-2 pr-4 font-mono text-white">{report.date}</td>
                    <td colSpan={6} className="py-2 pr-4 text-neutral-500">{report.error}</td>
                    <td className="py-2">
                      <GlassBadge variant="danger">error</GlassBadge>
                    </td>
                  </tr>
                );
              }
              const strategies = report.strategies ?? [];
              if (!strategies.length) {
                return (
                  <tr key={report.date} className="border-b border-white/5">
                    <td className="py-2 pr-4 font-mono text-white">{report.date}</td>
                    <td colSpan={6} className="py-2 pr-4 text-neutral-500">no strategies</td>
                    <td className="py-2">
                      <GlassBadge variant={report.overall_pass ? 'success' : 'warning'}>
                        {report.overall_pass ? 'pass' : 'incomplete'}
                      </GlassBadge>
                    </td>
                  </tr>
                );
              }
              return strategies.map((s, i) => (
                <tr key={`${report.date}-${s.strategy}`} className="border-b border-white/5">
                  {i === 0 ? (
                    <td className="py-2 pr-4 font-mono text-white" rowSpan={strategies.length}>
                      {report.date}
                    </td>
                  ) : null}
                  <td className="py-2 pr-4 text-neutral-300">{s.strategy}</td>
                  <td className="py-2 pr-4 text-right font-mono">
                    <span className={
                      parityTone(s.match_rate) === 'success' ? 'text-emerald-400'
                        : parityTone(s.match_rate) === 'warning' ? 'text-amber-400'
                          : parityTone(s.match_rate) === 'danger' ? 'text-red-400'
                            : 'text-neutral-400'
                    }>
                      {fmtPct(s.match_rate)}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right font-mono text-neutral-300">{s.bt_trades}</td>
                  <td className="py-2 pr-4 text-right font-mono text-neutral-300">{s.live_trades}</td>
                  <td className="py-2 pr-4 text-right font-mono text-neutral-300">{s.matched}</td>
                  <td className="py-2 pr-4 text-right font-mono text-neutral-400">
                    {s.avg_pnl_delta_pips != null ? `${s.avg_pnl_delta_pips.toFixed(2)}p` : 'n/a'}
                  </td>
                  {i === 0 ? (
                    <td className="py-2" rowSpan={strategies.length}>
                      <GlassBadge variant={report.overall_pass ? 'success' : 'danger'}>
                        {report.overall_pass ? 'PASS' : 'FAIL'}
                      </GlassBadge>
                    </td>
                  ) : null}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

export function PaperMatchDesk({
  paperMatch,
}: {
  paperMatch: ResearchPaperMatchResponse | null | undefined;
}) {
  const observation = paperMatch?.paper_observation;
  return (
    <div className="space-y-4">
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
      <ParityGateSection />
    </div>
  );
}
