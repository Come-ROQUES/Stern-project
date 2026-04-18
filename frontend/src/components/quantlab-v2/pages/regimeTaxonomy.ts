export const VOL_REGIME_ORDER = ["LOW", "NORMAL", "HIGH", "EXTREME"] as const;
export const SPREAD_REGIME_ORDER = ["TIGHT", "NORMAL", "WIDE"] as const;
export const SESSION_ORDER = ["ASIA", "LONDON", "OVERLAP", "NY", "UNKNOWN"] as const;

export type VolRegime = (typeof VOL_REGIME_ORDER)[number];
export type SpreadRegime = (typeof SPREAD_REGIME_ORDER)[number];
export type SessionLabel = (typeof SESSION_ORDER)[number];

export function normalizeVolRegime(value: string | null | undefined): VolRegime {
    const normalized = String(value ?? "NORMAL").trim().toUpperCase();
    if (normalized === "MEDIUM") return "NORMAL";
    if (VOL_REGIME_ORDER.includes(normalized as VolRegime)) {
        return normalized as VolRegime;
    }
    return "NORMAL";
}

export function normalizeSession(value: string | null | undefined): SessionLabel {
    const normalized = String(value ?? "UNKNOWN").trim().toUpperCase();
    if (normalized === "EARLY_ASIA") return "ASIA";
    if (normalized === "LATE_NY" || normalized === "NEW_YORK") return "NY";
    if (SESSION_ORDER.includes(normalized as SessionLabel)) {
        return normalized as SessionLabel;
    }
    return "UNKNOWN";
}

export function normalizeSpreadRegime(
    value: string | null | undefined
): SpreadRegime {
    const normalized = String(value ?? "NORMAL").trim().toUpperCase();
    if (normalized === "MEDIUM") return "NORMAL";
    if (SPREAD_REGIME_ORDER.includes(normalized as SpreadRegime)) {
        return normalized as SpreadRegime;
    }
    return "NORMAL";
}
