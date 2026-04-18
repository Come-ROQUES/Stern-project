import React, { useEffect, useMemo, useState } from 'react';

import {
  api,
  type ResearchCampaignDetailResponse,
  type ResearchCandidate,
  type ResearchPromotionStatusResponse,
  type S2ResearchDeskResponse,
} from '../../lib/api';
import { useBacktestContext } from '../../lib/useBacktestContext';
import { useResearchData } from '../../lib/useResearchData';
import { useViewActivity } from '../../lib/viewActivity';
import { EmptyState, GlassCard } from '../ui/glass';
import {
  StrategyPipelineDeskView,
  type StrategyPipelineDeskTab,
} from './StrategyPipelineDeskView';

type StrategyResearchDeskProps = {
  strategyId: string;
  title: string;
  badgeLabel?: string | null;
  initialCampaignLimit?: number;
  initialCandidateLimit?: number;
  activeTab?: StrategyPipelineDeskTab;
  showStageTabs?: boolean;
  showArtifactInspector?: boolean;
};

const EMPTY_FUNNEL = {
  eligibility: [],
  full_sample: [],
  walk_forward: [],
  stress: [],
};

const EMPTY_PROMOTION: ResearchPromotionStatusResponse = {
  owner_service: 'unknown',
  runtime_matches_recommended: false,
  status: 'missing_report',
  diff_vs_recommended: [],
};

export function StrategyResearchDesk({
  strategyId,
  title,
  badgeLabel,
  initialCampaignLimit = 8,
  initialCandidateLimit = 100,
  activeTab,
  showStageTabs = true,
  showArtifactInspector = true,
}: StrategyResearchDeskProps) {
  const viewActive = useViewActivity();
  const {
    activeStage,
    filtersByView,
    selectedCampaignId,
    selectedCandidateId,
    setActiveStage,
    setFilterForView,
    setPaperMatchContext,
    setPromotionContext,
    setSelectedCampaignId,
    setSelectedCandidateId,
    selectedResearchArtifactId,
    setSelectedResearchArtifactId,
    setSelectedResearchRunId,
  } = useBacktestContext();
  // Centralized research data with SWR cache (replaces 5-call Promise.all)
  const { data: researchData, loading: researchLoading, error: researchError } =
    useResearchData(strategyId, initialCampaignLimit);

  const campaigns = researchData?.campaigns ?? [];
  const promotion = researchData?.promotion ?? null;
  const paperMatch = researchData?.paperMatch ?? null;
  const runs = researchData?.runs ?? null;
  const launchCapabilities = researchData?.launchCapabilities ?? null;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaignDetail, setCampaignDetail] = useState<ResearchCampaignDetailResponse | null>(null);
  const [candidates, setCandidates] = useState<ResearchCandidate[]>([]);

  // Sync context from research data
  useEffect(() => {
    if (!researchData) return;
    setPromotionContext({
      recommended_candidate_id: promotion?.recommended_candidate_id ?? null,
      runtime_candidate_id: promotion?.runtime_candidate_id ?? null,
    });
    setPaperMatchContext({
      status: paperMatch?.status ?? null,
      runtime_candidate_id: paperMatch?.runtime_candidate_id ?? null,
    });
    const nextCampaignId =
      selectedCampaignId
      && campaigns.some((row) => row.campaign_id === selectedCampaignId)
        ? selectedCampaignId
        : campaigns[0]?.campaign_id ?? null;
    setSelectedCampaignId(nextCampaignId);
    if (!activeStage) {
      setActiveStage('campaigns');
    }
  }, [
    researchData,
    activeStage,
    campaigns,
    paperMatch?.runtime_candidate_id,
    paperMatch?.status,
    promotion?.recommended_candidate_id,
    promotion?.runtime_candidate_id,
    selectedCampaignId,
    setActiveStage,
    setPaperMatchContext,
    setPromotionContext,
    setSelectedCampaignId,
  ]);

  useEffect(() => {
    if (!viewActive) {
      return;
    }
    if (!selectedCampaignId) {
      setCampaignDetail(null);
      setCandidates([]);
      setSelectedCandidateId(null);
      setSelectedResearchArtifactId(null);
      setSelectedResearchRunId(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [campaignResult, candidatesResult] = await Promise.allSettled([
          api.getStrategyResearchCampaign(strategyId, selectedCampaignId),
          api.listStrategyResearchCandidates(
            strategyId,
            selectedCampaignId,
            initialCandidateLimit
          ),
        ]);
        if (cancelled) return;
        const campaignPayload =
          campaignResult.status === 'fulfilled'
            ? campaignResult.value
            : campaigns.find((row) => row.campaign_id === selectedCampaignId) ?? null;
        const candidateRows =
          candidatesResult.status === 'fulfilled'
            ? (candidatesResult.value.candidates ?? [])
            : [];
        if (campaignResult.status === 'rejected' && candidatesResult.status === 'rejected') {
          throw campaignResult.reason;
        }
        setCampaignDetail(campaignPayload);
        setCandidates(candidateRows);
        const nextCandidateId =
          selectedCandidateId
          && candidateRows.some((row) => row.candidate_id === selectedCandidateId)
            ? selectedCandidateId
            : (
              promotion?.recommended_candidate_id
              ?? candidateRows[0]?.candidate_id
              ?? null
            );
        setSelectedCandidateId(nextCandidateId);
        const nextCandidate = candidateRows.find((row) => row.candidate_id === nextCandidateId) ?? candidateRows[0] ?? null;
        const fallbackRunArtifactId = (
          runs?.runs.find((run) => run.artifacts[0]?.campaign_id === selectedCampaignId)?.artifacts[0]?.artifact_id
          ?? runs?.runs[0]?.artifacts[0]?.artifact_id
          ?? null
        );
        setSelectedResearchArtifactId(
          nextCandidate?.artifacts?.[0]?.artifact_id
          ?? fallbackRunArtifactId
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erreur chargement campaign detail');
          setCampaignDetail(null);
          setCandidates([]);
          setSelectedCandidateId(null);
          setSelectedResearchArtifactId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [
    initialCandidateLimit,
    promotion?.recommended_candidate_id,
    campaigns,
    runs?.runs,
    selectedCampaignId,
    selectedCandidateId,
    setSelectedResearchArtifactId,
    setSelectedCandidateId,
    setSelectedResearchRunId,
    strategyId,
    viewActive,
  ]);

  const payload = useMemo<S2ResearchDeskResponse | null>(() => {
    if (!campaigns.length && !loading && !error) {
      return {
        available: false,
        campaigns: [],
        candidates: [],
        runs: runs?.runs ?? [],
        stress_contract: null,
        selection_funnel: EMPTY_FUNNEL,
        promotion: promotion ?? EMPTY_PROMOTION,
      };
    }
    return {
      available: campaigns.length > 0,
      campaigns,
      candidates,
      runs: runs?.runs ?? [],
      stress_contract: campaignDetail?.stress_contract ?? null,
      selection_funnel: campaignDetail?.selection_funnel ?? EMPTY_FUNNEL,
      promotion: promotion ?? EMPTY_PROMOTION,
      _meta: {
        count: campaigns.length,
        candidate_count: candidates.length,
      },
    };
  }, [campaignDetail, campaigns, candidates, error, loading, promotion, runs?.runs]);

  const isLoading = (researchLoading || loading) && !campaigns.length && !candidates.length;
  const displayError = (researchError || error) && !campaigns.length;

  if (isLoading) {
    return (
      <GlassCard>
        <div className="text-sm text-neutral-400">Chargement du research desk…</div>
      </GlassCard>
    );
  }

  if (displayError) {
    return (
      <GlassCard variant="warning">
        <EmptyState title="Research desk indisponible" message={researchError || error || ''} />
      </GlassCard>
    );
  }

  return (
    <StrategyPipelineDeskView
      payload={payload}
      title={title}
      badgeLabel={badgeLabel}
      paperMatch={paperMatch}
      runs={runs?.runs ?? []}
      launchCapabilities={launchCapabilities}
      activeTab={activeTab ?? ((activeStage as StrategyPipelineDeskTab | undefined) ?? 'campaigns')}
      onTabChange={(tab) => setActiveStage(tab)}
      selectedCandidateId={selectedCandidateId}
      selectedArtifactId={selectedResearchArtifactId}
      onSelectArtifact={(artifactId) => setSelectedResearchArtifactId(artifactId)}
      onSelectCandidate={(candidateId) => {
        setSelectedCandidateId(candidateId);
        const candidate = candidates.find((row) => row.candidate_id === candidateId) ?? null;
        setSelectedResearchArtifactId(candidate?.artifacts?.[0]?.artifact_id ?? null);
      }}
      candidateFilter={
        (filtersByView[`research:${strategyId}:candidate_filter`] as
          | 'all'
          | 'retained'
          | 'rejected'
          | 'recommended'
          | 'runtime'
          | undefined) ?? 'all'
      }
      onCandidateFilterChange={(value) =>
        setFilterForView(`research:${strategyId}:candidate_filter`, value)
      }
      showStageTabs={showStageTabs}
      showArtifactInspector={showArtifactInspector}
    />
  );
}
