/**
 * PipelineBreadcrumb - Horizontal pipeline navigation breadcrumb.
 */

import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { StrategyPipelineDeskTab } from './StrategyPipelineDeskView';

interface BreadcrumbStage {
  key: StrategyPipelineDeskTab;
  label: string;
  count?: number;
}

const STAGES: BreadcrumbStage[] = [
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'candidates', label: 'Candidates' },
  { key: 'walkforward', label: 'Walk-Forward' },
  { key: 'promotion', label: 'Promotion' },
  { key: 'paper_match', label: 'Paper Match' },
];

interface PipelineBreadcrumbProps {
  activeStage: StrategyPipelineDeskTab;
  onStageClick: (stage: StrategyPipelineDeskTab) => void;
  counts?: Partial<Record<StrategyPipelineDeskTab, number>>;
  className?: string;
}

function statusDot(
  stage: StrategyPipelineDeskTab,
  active: StrategyPipelineDeskTab,
  counts: Partial<Record<StrategyPipelineDeskTab, number>>,
): string {
  const stageIdx = STAGES.findIndex((s) => s.key === stage);
  const activeIdx = STAGES.findIndex((s) => s.key === active);
  const count = counts[stage];
  if (stageIdx < activeIdx) return 'bg-emerald-400';
  if (stage === active) return 'bg-cyan-400 animate-pulse';
  if (count === 0) return 'bg-neutral-600';
  return 'bg-neutral-500';
}

function PipelineBreadcrumbInner({
  activeStage,
  onStageClick,
  counts = {},
  className,
}: PipelineBreadcrumbProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.06]',
        className,
      )}
    >
      {STAGES.map((stage, i) => (
        <React.Fragment key={stage.key}>
          <button
            type="button"
            onClick={() => onStageClick(stage.key)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors',
              stage.key === activeStage
                ? 'bg-white/[0.08] text-white font-medium'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.04]',
            )}
          >
            <span className={cn('w-1.5 h-1.5 rounded-full', statusDot(stage.key, activeStage, counts))} />
            {stage.label}
            {counts[stage.key] != null && (
              <span className="text-[10px] text-neutral-500 font-mono">
                {counts[stage.key]}
              </span>
            )}
          </button>
          {i < STAGES.length - 1 && (
            <ChevronRight className="w-3 h-3 text-neutral-600 flex-shrink-0" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export const PipelineBreadcrumb = React.memo(PipelineBreadcrumbInner);
