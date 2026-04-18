/**
 * Safe date utilities - NEVER use new Date().toISOString() directly
 * All date conversions must go through these helpers.
 */

/**
 * Safely convert any input to ISO string. Returns "-" for invalid/missing values.
 * Use this EVERYWHERE instead of new Date(x).toISOString()
 */
export function safeISO(input: unknown): string {
    if (input === null || input === undefined || input === "") return "-";

    // Handle timestamps in seconds (FX data often comes in seconds, not ms)
    if (typeof input === "number" && input < 1e12) {
        input = input * 1000;
    }

    try {
        const d = new Date(input as string | number | Date);
        if (Number.isNaN(d.getTime())) return "-";
        return d.toISOString();
    } catch {
        return "-";
    }
}

/**
 * Safely get timestamp in milliseconds. Returns null for invalid values.
 */
export function safeTimestampMs(input: unknown): number | null {
    if (input === null || input === undefined || input === "") return null;

    // Handle timestamps in seconds
    if (typeof input === "number" && input < 1e12) {
        input = input * 1000;
    }

    try {
        const d = new Date(input as string | number | Date);
        const ts = d.getTime();
        if (Number.isNaN(ts)) return null;
        return ts;
    } catch {
        return null;
    }
}

/**
 * Format timestamp for display (HH:MM:SS)
 */
export function formatTime(input: unknown, tz: "UTC" | "LOCAL" = "UTC"): string {
    if (input === null || input === undefined || input === "") return "-";

    try {
        const d = new Date(input as string | number | Date);
        if (Number.isNaN(d.getTime())) return "-";

        if (tz === "UTC") {
            return d.toISOString().split("T")[1]?.slice(0, 8) || "-";
        }
        return d.toLocaleTimeString();
    } catch {
        return "-";
    }
}

/**
 * Format date for display (YYYY-MM-DD)
 */
export function formatDate(input: unknown): string {
    if (input === null || input === undefined || input === "") return "-";

    try {
        const d = new Date(input as string | number | Date);
        if (Number.isNaN(d.getTime())) return "-";
        return d.toISOString().slice(0, 10);
    } catch {
        return "-";
    }
}

/**
 * Format date+time in UTC (YYYY-MM-DD HH:MM:SS)
 */
export function formatDateTimeUTC(input: unknown): string {
    if (input === null || input === undefined || input === "") return "-";

    try {
        const d = new Date(input as string | number | Date);
        if (Number.isNaN(d.getTime())) return "-";
        const iso = d.toISOString();
        return iso.replace("T", " ").slice(0, 19);
    } catch {
        return "-";
    }
}

/**
 * Check if a timestamp is valid
 */
export function isValidTimestamp(input: unknown): boolean {
    if (input === null || input === undefined || input === "") return false;

    try {
        const d = new Date(input as string | number | Date);
        return !Number.isNaN(d.getTime());
    } catch {
        return false;
    }
}
