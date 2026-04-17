/**
 * PortfolioEpochContext -- Global state for portfolio epoch selection.
 *
 * Provides:
 * - currentEpoch: the latest created epoch number
 * - selectedEpoch: the epoch being viewed (can differ from current)
 * - epochs[]: summary per epoch (trade count, PnL, dates)
 * - advanceEpoch(): create a new epoch (POST)
 * - isViewingCurrent: selectedEpoch === currentEpoch
 */

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import {
    canonicalApi,
    type EpochSummary,
} from './canonicalApi';

interface PortfolioEpochContextType {
    currentEpoch: number | null;
    selectedEpoch: number | null;
    setSelectedEpoch: (epoch: number) => void;
    epochs: EpochSummary[];
    epochStartedAt: string | null;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    advanceEpoch: () => Promise<boolean>;
    isViewingCurrent: boolean;
}

const PortfolioEpochContext = createContext<PortfolioEpochContextType | null>(null);

export function PortfolioEpochProvider({ children }: { children: React.ReactNode }) {
    const [currentEpoch, setCurrentEpoch] = useState<number | null>(null);
    const [selectedEpoch, setSelectedEpoch] = useState<number | null>(null);
    const [epochs, setEpochs] = useState<EpochSummary[]>([]);
    const [epochStartedAt, setEpochStartedAt] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [epochRes, listRes] = await Promise.all([
                canonicalApi.getPortfolioEpoch(),
                canonicalApi.listPortfolioEpochs(),
            ]);
            const ce = epochRes.current_epoch ?? 1;
            setCurrentEpoch(ce);
            setEpochStartedAt(epochRes.epoch_started_at ?? null);
            setEpochs(listRes.epochs);
            // Initialise selected to current if not set yet
            setSelectedEpoch((prev) => prev ?? ce);
        } catch (e: unknown) {
            const msg =
                e instanceof Error ? e.message : 'Erreur chargement epoch';
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const advanceEpoch = useCallback(async (): Promise<boolean> => {
        try {
            const res = await canonicalApi.advancePortfolioEpoch();
            setCurrentEpoch(res.new_epoch);
            setSelectedEpoch(res.new_epoch);
            await refresh();
            return true;
        } catch {
            return false;
        }
    }, [refresh]);

    const isViewingCurrent = useMemo(
        () =>
            selectedEpoch != null &&
            currentEpoch != null &&
            selectedEpoch === currentEpoch,
        [selectedEpoch, currentEpoch],
    );

    const value = useMemo<PortfolioEpochContextType>(
        () => ({
            currentEpoch,
            selectedEpoch,
            setSelectedEpoch,
            epochs,
            epochStartedAt,
            loading,
            error,
            refresh,
            advanceEpoch,
            isViewingCurrent,
        }),
        [
            currentEpoch,
            selectedEpoch,
            epochs,
            epochStartedAt,
            loading,
            error,
            refresh,
            advanceEpoch,
            isViewingCurrent,
        ],
    );

    return (
        <PortfolioEpochContext.Provider value={value}>
            {children}
        </PortfolioEpochContext.Provider>
    );
}

export function usePortfolioEpochContext(): PortfolioEpochContextType {
    const ctx = useContext(PortfolioEpochContext);
    if (!ctx) {
        throw new Error(
            'usePortfolioEpochContext must be used within PortfolioEpochProvider',
        );
    }
    return ctx;
}
