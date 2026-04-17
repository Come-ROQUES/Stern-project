import React, { useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { useBacktestContext } from '../../lib/useBacktestContext';
import { prefetchStrategyData } from '../../lib/useResearchData';
import { cn } from '../../lib/utils';
import { GlassBadge, GlassCard } from '../ui/glass';
import { BacktestCockpit } from './BacktestCockpit';
import { BacktestLaunch } from './BacktestLaunch';
import { PipelineBreadcrumb } from './PipelineBreadcrumb';
import { StrategyResearchDesk } from './StrategyResearchDesk';
import type { StrategyPipelineDeskTab } from './StrategyPipelineDeskView';

type BacktestPipelineView =
  | 'bt-cockpit'
  | 'bt-campaigns'
  | 'bt-candidates'
  | 'bt-walk-forward'
  | 'bt-promotion'
  | 'bt-paper-match'
  | 'bt-runs'
  | 'bt-launch';

type StrategyMeta = {
  title: string;
  badgeLabel: string;
  ownerService: string;
  status: string;
};

const STRATEGY_META: Record<string, StrategyMeta> = {
  damping_wave: {
    title: 'S1 Research Desk',
    badgeLabel: 'EURUSD',
    ownerService: 's1-dw-a1',
    status: 'pipeline ready',
  },
  s2_pairs_trading: {
    title: 'S2 Research Desk',
    badgeLabel: 'AUDNZD',
    ownerService: 's2-pairs-a1',
    status: 'pipeline ready',
  },
  tf_pullback_v1: {
    title: 'S3 Research Desk',
    badgeLabel: 'EURUSD',
    ownerService: 's3-tf-a1',
    status: 'pipeline ready',
  },
};

const STRATEGY_ORDER = ['damping_wave', 's2_pairs_trading', 'tf_pullback_v1'];

const STAGE_BY_VIEW: Record<Exclude<BacktestPipelineView, 'bt-cockpit'>, StrategyPipelineDeskTab> = {
  'bt-campaigns': 'campaigns',
  'bt-candidates': 'candidates',
  'bt-walk-forward': 'walkforward',
  'bt-promotion': 'promotion',
  'bt-paper-match': 'paper_match',
  'bt-runs': 'runs',
  'bt-launch': 'launch',
};

const VIEW_META: Record<
  BacktestPipelineView,
  { kicker: string; title: string; description: string }
> = {
  'bt-cockpit': {
    kicker: 'Governance Surface',
    title: 'Backtest Cockpit',
    description:
      'Vue transverse du pipeline research. On entre par la maturite, les blocages et le drift, pas par un launcher.',
  },
  'bt-campaigns': {
    kicker: 'Stage 1',
    title: 'Campaigns',
    description:
      'Registry des campagnes, dataset, moteur, search space et funnel de retention. La campagne ne promeut jamais automatiquement.',
  },
  'bt-candidates': {
    kicker: 'Stage 2',
    title: 'Candidates',
    description:
      "Leaderboard de robustesse. On filtre les faux positifs avant d'investir le compute sur le walk-forward.",
  },
  'bt-walk-forward': {
    kicker: 'Stage 3',
    title: 'Walk-Forward',
    description:
      'Validation OOS temporelle et dispersion par folds. Le pire fold compte plus que le meilleur graphique.',
  },
  'bt-promotion': {
    kicker: 'Stages 4-6',
    title: 'Promotion',
    description:
      'Decision formelle, checklist de validation, manifest versionne et raisons explicites de blocage.',
  },
  'bt-paper-match': {
    kicker: 'Stage 7',
    title: 'Paper Match',
    description:
      'Runtime parity, observation paper et rollback target. Sans match runtime, la recherche ne vaut rien.',
  },
  'bt-runs': {
    kicker: 'Diagnostics',
    title: 'Runs',
    description:
      "Registre des runs isoles pour la verification technique. Un run n'est jamais promotable.",
  },
  'bt-launch': {
    kicker: 'Secondary Surface',
    title: 'Launch',
    description:
      'Orchestration contextuelle des jobs. Cette page existe pour executer, pas pour gouverner.',
  },
};

const PIPELINE_STEPS: Array<{ view: BacktestPipelineView; label: string }> = [
  { view: 'bt-cockpit', label: 'Cockpit' },
  { view: 'bt-campaigns', label: 'Campaigns' },
  { view: 'bt-candidates', label: 'Candidates' },
  { view: 'bt-walk-forward', label: 'Walk-Forward' },
  { view: 'bt-promotion', label: 'Promotion' },
  { view: 'bt-paper-match', label: 'Paper Match' },
  { view: 'bt-runs', label: 'Runs' },
  { view: 'bt-launch', label: 'Launch' },
];

function PipelineRibbon({
  activeView,
  onNavigate,
}: {
  activeView: BacktestPipelineView;
  onNavigate: (view: BacktestPipelineView) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PIPELINE_STEPS.map((step, index) => (
        <React.Fragment key={step.view}>
          <button
            type="button"
            onClick={() => onNavigate(step.view)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] transition-colors',
              activeView === step.view
                ? 'border-cyan-400/30 bg-cyan-500/[0.12] text-cyan-200'
                : 'border-white/10 bg-white/[0.03] text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200'
            )}
          >
            {step.label}
          </button>
          {index < PIPELINE_STEPS.length - 1 && (
            <span className="text-[10px] text-neutral-600">{'->'}</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

const PAGE_TRANSITION = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.15, ease: [0, 0, 0.2, 1] as const },
} as const;

function StrategySelector({
  selectedStrategyId,
  onSelectStrategy,
}: {
  selectedStrategyId: string;
  onSelectStrategy: (strategyId: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
      {STRATEGY_ORDER.map((strategyId) => {
        const meta = STRATEGY_META[strategyId];
        const selected = selectedStrategyId === strategyId;
        return (
          <button
            key={strategyId}
            type="button"
            onClick={() => onSelectStrategy(strategyId)}
            onMouseEnter={() => prefetchStrategyData(strategyId)}
            className={cn(
              'rounded-2xl border p-4 text-left transition-colors',
              selected
                ? 'border-cyan-400/30 bg-cyan-500/[0.08]'
                : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">{meta.title}</div>
                <div className="mt-1 text-xs text-neutral-500">{meta.ownerService}</div>
              </div>
              <GlassBadge variant={meta.status === 'pipeline ready' ? 'success' : 'warning'}>
                {meta.status}
              </GlassBadge>
            </div>
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <GlassBadge variant="info">{meta.badgeLabel}</GlassBadge>
              <GlassBadge variant="default">{strategyId}</GlassBadge>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function SelectedStrategyActions({
  strategyId,
  onNavigate,
}: {
  strategyId: string;
  onNavigate: (view: BacktestPipelineView) => void;
}) {
  const meta = STRATEGY_META[strategyId];

  return (
    <GlassCard className="border-cyan-400/20 bg-cyan-500/[0.04]">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-cyan-300">
            Strategie selectionnee
          </div>
          <div className="mt-2 text-lg font-semibold text-white">{meta.title}</div>
          <div className="mt-1 text-sm text-neutral-400">
            {meta.ownerService} / {meta.badgeLabel}
          </div>
        </div>
        <GlassBadge variant={meta.status === 'pipeline ready' ? 'success' : 'warning'}>
          {meta.status}
        </GlassBadge>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => onNavigate('bt-campaigns')}
          className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition-colors hover:bg-white/[0.05]"
        >
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">Entrer</div>
          <div className="mt-1 text-sm text-white">Ouvrir le desk strategie</div>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('bt-promotion')}
          className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition-colors hover:bg-white/[0.05]"
        >
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">Verifier</div>
          <div className="mt-1 text-sm text-white">Lire la decision de promotion</div>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('bt-launch')}
          className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition-colors hover:bg-white/[0.05]"
        >
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">Executer</div>
          <div className="mt-1 text-sm text-white">Ouvrir la surface de lancement</div>
        </button>
      </div>
    </GlassCard>
  );
}

export function BacktestPipelineWorkspace({ view }: { view: BacktestPipelineView }) {
  const {
    navigateToTab,
    selectedStrategyId: selectedStrategyIdState,
    setActiveStage,
    setSelectedStrategyId,
  } = useBacktestContext();

  const selectedStrategyId = useMemo(() => {
    if (selectedStrategyIdState && STRATEGY_META[selectedStrategyIdState]) {
      return selectedStrategyIdState;
    }
    return 's2_pairs_trading';
  }, [selectedStrategyIdState]);

  const meta = VIEW_META[view];
  const activeStage = view === 'bt-cockpit'
    ? undefined
    : STAGE_BY_VIEW[view as Exclude<BacktestPipelineView, 'bt-cockpit'>];
  const selectedMeta = STRATEGY_META[selectedStrategyId];

  useEffect(() => {
    if (activeStage) {
      setActiveStage(activeStage);
    }
  }, [activeStage, setActiveStage]);

  const handleNavigate = (nextView: BacktestPipelineView) => {
    navigateToTab?.(nextView);
  };

  if (view === 'bt-cockpit') {
    return (
      <motion.div className="space-y-4" {...PAGE_TRANSITION} key="bt-cockpit">
        <GlassCard className="border-cyan-400/20 bg-[radial-gradient(circle_at_top_left,rgba(6,182,212,0.16),transparent_40%),linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))]">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="max-w-3xl">
                <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">
                  {meta.kicker}
                </div>
                <h1 className="mt-2 text-2xl font-semibold text-white">{meta.title}</h1>
                <p className="mt-3 text-sm text-neutral-300">{meta.description}</p>
              </div>
            </div>

            <PipelineRibbon activeView={view} onNavigate={handleNavigate} />
          </div>
        </GlassCard>

        <BacktestCockpit
          selectedStrategyId={selectedStrategyId}
          onSelectStrategy={setSelectedStrategyId}
        />

        <SelectedStrategyActions
          strategyId={selectedStrategyId}
          onNavigate={handleNavigate}
        />
      </motion.div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div className="space-y-4" {...PAGE_TRANSITION} key={view}>
        {/* Header */}
        <GlassCard className="border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))]">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="max-w-3xl">
                <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">
                  {meta.kicker}
                </div>
                <h1 className="mt-2 text-2xl font-semibold text-white">{meta.title}</h1>
                <p className="mt-3 text-sm text-neutral-300">{meta.description}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 min-w-[240px]">
                <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                  Strategy
                </div>
                <div className="mt-1 text-sm font-semibold text-white">{selectedMeta.title}</div>
                <div className="mt-1 text-xs text-neutral-400">
                  {selectedMeta.ownerService} / {selectedMeta.badgeLabel}
                </div>
              </div>
            </div>

            {/* Pipeline breadcrumb for stage navigation */}
            {activeStage && (
              <PipelineBreadcrumb
                activeStage={activeStage}
                onStageClick={(stage) => {
                  const viewMap: Record<StrategyPipelineDeskTab, BacktestPipelineView> = {
                    campaigns: 'bt-campaigns',
                    candidates: 'bt-candidates',
                    walkforward: 'bt-walk-forward',
                    promotion: 'bt-promotion',
                    paper_match: 'bt-paper-match',
                    runs: 'bt-runs',
                    launch: 'bt-launch',
                  };
                  handleNavigate(viewMap[stage] ?? 'bt-campaigns');
                }}
              />
            )}

            <PipelineRibbon activeView={view} onNavigate={handleNavigate} />
          </div>
        </GlassCard>

        {/* Strategy selector */}
        <StrategySelector
          selectedStrategyId={selectedStrategyId}
          onSelectStrategy={setSelectedStrategyId}
        />

        {/* Research desk content */}
        <StrategyResearchDesk
          strategyId={selectedStrategyId}
          title={selectedMeta.title}
          badgeLabel={selectedMeta.badgeLabel}
          activeTab={activeStage}
          showStageTabs={false}
        />

        {view === 'bt-launch' && <BacktestLaunch />}
      </motion.div>
    </AnimatePresence>
  );
}
