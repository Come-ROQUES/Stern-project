import React from 'react';

import type { ResearchRun } from '../../lib/api';
import { cn } from '../../lib/utils';
import { EmptyState, GlassBadge, GlassCard } from '../ui/glass';

function statusTone(status: string): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'pass' || status === 'promoted') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'fail' || status === 'blocked') return 'danger';
  return 'info';
}

export function RunsDesk({
  runs,
  selectedArtifactId,
  onSelectArtifact,
}: {
  runs: ResearchRun[];
  selectedArtifactId?: string | null;
  onSelectArtifact?: (artifactId: string | null) => void;
}) {
  return (
    <GlassCard>
      <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
        Research Artifacts
      </div>
      {runs.length ? (
        <div className="space-y-2">
          {runs.map((run) => (
            <button
              key={run.run_id}
              type="button"
              onClick={() => onSelectArtifact?.(run.artifacts[0]?.artifact_id ?? null)}
              className={cn(
                'w-full rounded-xl border px-4 py-3 text-left text-xs transition-colors',
                selectedArtifactId && run.artifacts[0]?.artifact_id === selectedArtifactId
                  ? 'border-cyan-400/30 bg-cyan-500/[0.08]'
                  : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]'
              )}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-mono text-white">{run.run_id}</div>
                  <div className="mt-1 text-neutral-500">{run.label}</div>
                  {run.artifacts[0] && (
                    <div className="mt-1 text-[11px] text-neutral-600">
                      {run.artifacts[0].campaign_id} · {run.artifacts[0].candidate_id}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <GlassBadge variant="default">{run.stage}</GlassBadge>
                  <GlassBadge variant={statusTone(run.status)}>{run.status}</GlassBadge>
                  <GlassBadge variant={run.promotable ? 'danger' : 'info'}>
                    {run.promotable ? 'promotable' : 'non-promotable'}
                  </GlassBadge>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState title="Aucun artefact" message="Les artefacts de recherche resolves apparaitront ici une fois les campagnes chargees." />
      )}
    </GlassCard>
  );
}
