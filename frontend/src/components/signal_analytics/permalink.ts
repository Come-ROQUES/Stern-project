import { DatasetMode, Filters, ParamsOverrides, TimezoneMode } from "./types";

type PermalinkState = {
  dataset: DatasetMode;
  filters: Filters;
  params: ParamsOverrides;
  tz: TimezoneMode;
};

const filterKeys: (keyof Filters)[] = [
  "acceptedOnly",
  "side",
  "regime",
  "session",
  "timeframe",
  "outcomeRequired",
  "ttlMax",
];

const paramKeys: (keyof ParamsOverrides)[] = [
  "minAmplitude",
  "maxSpread",
  "ttlBars",
  "feesPips",
];

export function encodeStateToQuery(state: PermalinkState): string {
  const params = new URLSearchParams();
  params.set("ds", state.dataset);
  params.set("tz", state.tz);
  filterKeys.forEach((k) => {
    const v = state.filters[k] as any;
    if (v === null || v === undefined) return;
    params.set(k, String(v));
  });
  paramKeys.forEach((k) => {
    params.set(k, String(state.params[k]));
  });
  return `?${params.toString()}`;
}

export function decodeStateFromQuery(
  search: string,
  defaults: PermalinkState,
): PermalinkState {
  const params = new URLSearchParams(search);
  const get = (key: string) => params.get(key);
  const dataset = (get("ds") as DatasetMode) || defaults.dataset;
  const tz = (get("tz") as TimezoneMode) || defaults.tz;
  const filters = { ...defaults.filters };
  filterKeys.forEach((k) => {
    const raw = get(k);
    if (raw == null) return;
    if (raw === "null") return;
    if (k === "ttlMax") {
      const num = Number(raw);
      (filters as any)[k] = Number.isFinite(num) ? num : (filters as any)[k];
      return;
    }
    if (raw === "true" || raw === "false") {
      (filters as any)[k] = raw === "true";
    } else {
      (filters as any)[k] = raw;
    }
  });
  const paramsOverrides = { ...defaults.params };
  paramKeys.forEach((k) => {
    const raw = get(k);
    if (raw == null) return;
    const num = Number(raw);
    paramsOverrides[k] = Number.isFinite(num) ? num : paramsOverrides[k];
  });
  return { dataset, filters, params: paramsOverrides, tz };
}
