/**
 * useIsMobile - Media query hook for mobile detection.
 *
 * Breakpoint: 1023px (matches Tailwind lg: at 1024px).
 * Uses useSyncExternalStore for tear-free reads and SSR safety.
 */
import { useSyncExternalStore } from 'react';

const MOBILE_QUERY = '(max-width: 1023px)';

function subscribe(callback: () => void): () => void {
    const mql = window.matchMedia(MOBILE_QUERY);
    mql.addEventListener('change', callback);
    return () => mql.removeEventListener('change', callback);
}

function getSnapshot(): boolean {
    return window.matchMedia(MOBILE_QUERY).matches;
}

function getServerSnapshot(): boolean {
    return false;
}

export function useIsMobile(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Non-hook variant for use outside React components (e.g. API helpers).
 */
export function isMobileViewport(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(MOBILE_QUERY).matches;
}
