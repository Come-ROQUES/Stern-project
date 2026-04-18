/**
 * PipelineProgressDots - Visual representation of the 8 canonical pipeline stages.
 */

import React from 'react';
import { cn } from '../../lib/utils';

const PIPELINE_STAGES = [
  { key: 'sanity', label: 'Sanity' },
  { key: 'campaign', label: 'Campaign' },
  { key: 'candidate', label: 'Candidate' },
  { key: 'walkforward', label: 'Walk-Forward' },
  { key: 'stress', label: 'Stress' },
  { key: 'promotion', label: 'Promotion' },
  { key: 'manifest', label: 'Manifest' },
  { key: 'paper', label: 'Paper' },
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number]['key'];

interface PipelineProgressDotsProps {
  activeStage?: string | null;
  completedStages?: string[];
  blockedStage?: string | null;
  className?: string;
}

function stageStatus(
  stage: string,
  activeStage: string | null,
  completedStages: string[],
  blockedStage: string | null,
): 'completed' | 'active' | 'blocked' | 'pending' {
  if (completedStages.includes(stage)) return 'completed';
  if (stage === blockedStage) return 'blocked';
  if (stage === activeStage) return 'active';
  return 'pending';
}

const DOT_STYLES = {
  completed: 'bg-emerald-400 shadow-emerald-400/30 shadow-sm',
  active: 'bg-cyan-400 shadow-cyan-400/30 shadow-sm animate-pulse',
  blocked: 'bg-rose-400 shadow-rose-400/30 shadow-sm',
  pending: 'bg-neutral-700',
} as const;

const LINE_STYLES = {
  completed: 'bg-emerald-400/40',
  active: 'bg-cyan-400/30',
  blocked: 'bg-rose-400/30',
  pending: 'bg-neutral-700/50',
} as const;

function PipelineProgressDotsInner({
  activeStage = null,
  completedStages = [],
  blockedStage = null,
  className,
}: PipelineProgressDotsProps) {
  return (
    <div className={cn('flex items-center gap-0', className)}>
      {PIPELINE_STAGES.map((stage, i) => {
        const status = stageStatus(stage.key, activeStage, completedStages, blockedStage);
        return (
          <React.Fragment key={stage.key}>
            <div className="flex flex-col items-center gap-1" title={stage.label}>
              <div className={cn('w-2.5 h-2.5 rounded-full transition-colors', DOT_STYLES[status])} />
              <span className="text-[9px] text-neutral-500 leading-none whitespace-nowrap">
                {stage.label}
              </span>
            </div>
            {i < PIPELINE_STAGES.length - 1 && (
              <div
                className={cn(
                  'h-[2px] flex-1 min-w-[8px] max-w-[20px] mt-[-10px]',
                  LINE_STYLES[status],
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export const PipelineProgressDots = React.memo(PipelineProgressDotsInner);
