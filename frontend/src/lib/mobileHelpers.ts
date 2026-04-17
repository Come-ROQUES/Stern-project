/**
 * mobileHelpers - Utility functions for mobile-specific behavior.
 *
 * Keeps API layer pure: limits are applied at the call site, not inside api.ts.
 */
import { isMobileViewport } from './useIsMobile';

/** Ratio applied to desktop data limits on mobile viewports. */
const MOBILE_LIMIT_RATIO = 0.4;

/**
 * Returns a reduced data limit when the viewport is mobile-sized.
 * Use this when calling API functions that accept a `limit` parameter.
 *
 * Example: api.getOhlc(mobileLimit(300))
 */
export function mobileLimit(desktopLimit: number): number {
    if (isMobileViewport()) {
        return Math.max(10, Math.ceil(desktopLimit * MOBILE_LIMIT_RATIO));
    }
    return desktopLimit;
}

/** Default mobile chart heights (px). */
export const MOBILE_CHART_HEIGHT = 200;
export const DESKTOP_CHART_HEIGHT = 350;

/** Returns chart height based on viewport. */
export function chartHeight(desktop: number = DESKTOP_CHART_HEIGHT, mobile: number = MOBILE_CHART_HEIGHT): number {
    return isMobileViewport() ? mobile : desktop;
}
