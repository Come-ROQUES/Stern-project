import { describe, expect, it } from 'vitest';

import { getCampaignStrategies } from './BacktestResults';

describe('getCampaignStrategies', () => {
    it('returns empty array when campaign settings are missing', () => {
        expect(getCampaignStrategies(null)).toEqual([]);
        expect(getCampaignStrategies({})).toEqual([]);
        expect(getCampaignStrategies({ settings: null })).toEqual([]);
        expect(getCampaignStrategies({ settings: { strategies: null } })).toEqual([]);
    });

    it('filters unknown strategies and preserves known order', () => {
        expect(
            getCampaignStrategies({
                settings: {
                    strategies: ['tf_pullback', 'unknown' as never, 'dw'],
                },
            })
        ).toEqual(['dw', 'tf_pullback']);
    });
});
