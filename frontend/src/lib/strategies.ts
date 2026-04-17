export type StrategyId =
  | "damping_wave"
  | "s2_pairs_trading"
  | "tf_pullback_v1";

export type StrategyRegistryEntry = {
  id: StrategyId;
  shortLabel: string;
  label: string;
  canonicalSummary: boolean;
};

export const STRATEGY_REGISTRY: readonly StrategyRegistryEntry[] = [
  {
    id: "damping_wave",
    shortLabel: "MM",
    label: "Market Maker",
    canonicalSummary: true,
  },
  {
    id: "s2_pairs_trading",
    shortLabel: "MIC",
    label: "Microstructure Lens",
    canonicalSummary: false,
  },
  {
    id: "tf_pullback_v1",
    shortLabel: "TRL",
    label: "Trend Lens",
    canonicalSummary: true,
  },
];

const STRATEGY_BY_ID: Record<StrategyId, StrategyRegistryEntry> = {
  damping_wave: STRATEGY_REGISTRY[0],
  s2_pairs_trading: STRATEGY_REGISTRY[1],
  tf_pullback_v1: STRATEGY_REGISTRY[2],
};

export function isStrategyId(value: string | null | undefined): value is StrategyId {
  if (!value) return false;
  return value in STRATEGY_BY_ID;
}

export function strategyLabel(value: string | null | undefined): string {
  if (!isStrategyId(value)) return value ?? "unknown";
  return STRATEGY_BY_ID[value].label;
}

export function strategyShortLabel(value: string | null | undefined): string {
  if (!isStrategyId(value)) return value ?? "UNK";
  return STRATEGY_BY_ID[value].shortLabel;
}
