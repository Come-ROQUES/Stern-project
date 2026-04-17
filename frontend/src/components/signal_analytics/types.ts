import { Signal } from "../../lib/api";

export type DatasetMode = "ACCEPTED" | "TRADED" | "CLOSED";

export type TimezoneMode = "UTC" | "LOCAL";

export type Filters = {
  acceptedOnly: boolean;
  side: "BUY" | "SELL" | "ALL";
  regime: string | "ALL";
  session: "ASIA" | "LONDON" | "NY" | "ALL";
  timeframe: "1H" | "4H" | "24H" | "ALL";
  outcomeRequired: boolean;
  brushSelection: {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
  } | null;
  ttlMax?: number | null;
};

export type ParamsOverrides = {
  minAmplitude: number;
  maxSpread: number;
  ttlBars: number;
  feesPips: number;
};

export type QualityGateThresholds = {
  missingOutcomeMaxPct: number;
  missingTTLMaxPct: number;
  dupTsMaxPct: number;
  extremeSpreadP99: number;
};

export type DerivedSignal = Signal & {
  ts: number;
  amplitude: number | null;
  net_outcome: number | null;
  hasOutcome: boolean;
  hasTTL: boolean;
  isTraded: boolean;
  isClosed: boolean;
  sessionLabel: "ASIA" | "LONDON" | "NY" | "UNKNOWN";
  regimeLabel: string;
};

export type FunnelCounts = {
  total: number;
  accepted: number;
  traded: number;
  closed: number;
  winners: number;
  losers: number;
};

export type RollingPoint = {
  ts: number;
  medianNet: number | null;
  winrate: number | null;
  n: number;
};

export type SurvivalPoint = { t: number; survival: number; hazard: number };
