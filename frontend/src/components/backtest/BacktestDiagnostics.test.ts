import { describe, expect, it } from 'vitest';

import { normalizeWalkForwardDetailedReport } from './BacktestDiagnostics';

describe('normalizeWalkForwardDetailedReport', () => {
    it('hydrates missing detailed-report sections from the walk-forward payload', () => {
        const report = normalizeWalkForwardDetailedReport({
            available: true,
            phase: 'oos',
            total_trades: 2,
            report: {
                exit_analysis: {
                    TP: {
                        count: 1,
                        total_pnl: 4,
                        wins: 1,
                        losses: 0,
                        avg_pnl: 4,
                        win_rate: 1,
                    },
                    SL: {
                        count: 1,
                        total_pnl: -2,
                        wins: 0,
                        losses: 1,
                        avg_pnl: -2,
                        win_rate: 0,
                    },
                },
                mfe_mae: [
                    {
                        mfe_pips: 5,
                        mae_pips: 1,
                        pnl_net_pips: 4,
                        exit_reason: 'TP',
                        direction: 'BUY',
                    },
                    {
                        mfe_pips: 1,
                        mae_pips: 3,
                        pnl_net_pips: -2,
                        exit_reason: 'SL',
                        direction: 'SELL',
                    },
                ],
                hourly_heatmap: {
                    '9': { count: 2, avg_pnl: 1, total_pnl: 2 },
                },
                cost_decomposition: {
                    total_cost_pips: 0.6,
                    total_gross_pnl_pips: 3,
                    total_net_pnl_pips: 2,
                    cost_drag_pct: 20,
                },
                top_drawdowns: [
                    {
                        start_idx: 0,
                        end_idx: 1,
                        dd_pips: 2,
                        start_ts: '2026-03-01T09:00:00Z',
                        end_ts: '2026-03-01T09:05:00Z',
                    },
                ],
            },
        });

        expect(report.n_trades).toBe(2);
        expect(report.mfe_mae_analysis.avg_mfe_pips).toBe(3);
        expect(report.mfe_mae_analysis.avg_mae_pips).toBe(2);
        expect(report.exit_reason_dist.TP.count).toBe(1);
        expect(report.hourly_heatmap).toEqual([
            {
                hour_utc: 9,
                count: 2,
                avg_pnl_pips: 1,
                total_pnl_pips: 2,
                win_rate: 0,
            },
        ]);
        expect(report.drawdown_periods[0]?.depth_pips).toBe(2);
        expect(report.cost_decomposition.avg_total_cost_pips).toBe(0.3);
    });
});
