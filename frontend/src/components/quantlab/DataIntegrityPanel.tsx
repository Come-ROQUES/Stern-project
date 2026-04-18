/**
 * DataIntegrityPanel.tsx
 *
 * QUANT LAB V3 - Phase 1: DATA QUALITY Tab
 *
 * Displays:
 * 1. Run Coverage Table (integrity scores, counts)
 * 2. Invariants Validation (CRITICAL/WARNING/INFO checks)
 * 3. Anomalies Browser (with severity filtering)
 *
 * Design: Institutional-grade data quality dashboard
 * Priority: Foundation for all research (garbage in = garbage out)
 */

import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle, Info, TrendingDown } from 'lucide-react';

interface RunCoverage {
    run_id: string;
    shocks_count: number;
    signals_count: number;
    trades_count: number;
    orphan_trades_count: number;
    missing_exits_count: number;
    missing_timestamps_count: number;
    missing_commissions_count: number;
    integrity_score: number;
}

interface InvariantResult {
    run_id: string;
    invariant_name: string;
    passed: boolean;
    severity: 'CRITICAL' | 'WARNING' | 'INFO';
    violation_count: number;
    sample_ids: string[];
    description: string;
}

interface Anomaly {
    run_id: string;
    type: string;
    severity: 'CRITICAL' | 'WARNING' | 'INFO';
    affected_count: number;
    sample_ids: string[];
    exclude_by_default: boolean;
    description: string;
}

interface CoverageResponse {
    run_coverage: RunCoverage[];
    summary: {
        runs_analyzed: number;
        avg_integrity_score: number;
        total_shocks: number;
        total_signals: number;
        total_trades: number;
        total_orphans: number;
    };
}

interface InvariantsResponse {
    invariants: InvariantResult[];
    summary: {
        total_checks: number;
        passed: number;
        failed: number;
        by_severity: Record<string, { total: number; passed: number; failed: number }>;
    };
}

interface AnomaliesResponse {
    anomalies: Anomaly[];
    summary: {
        total_anomalies: number;
        by_type: Record<string, number>;
        by_severity: Record<string, number>;
    };
}

const API_BASE = '/react-api';

export const DataIntegrityPanel: React.FC = () => {
    const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
    const [invariants, setInvariants] = useState<InvariantsResponse | null>(null);
    const [anomalies, setAnomalies] = useState<AnomaliesResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedSeverity, setSelectedSeverity] = useState<string | null>(null);
    const [includeExcluded, setIncludeExcluded] = useState(false);

    useEffect(() => {
        fetchData();
    }, [selectedSeverity, includeExcluded]);

    const fetchData = async () => {
        try {
            setLoading(true);
            setError(null);

            const [coverageRes, invariantsRes, anomaliesRes] = await Promise.allSettled([
                fetch(`${API_BASE}/api/data_quality/coverage?limit=20`).then((r) => r.json()),
                fetch(
                    `${API_BASE}/api/data_quality/invariants?limit=20${selectedSeverity ? `&severity=${selectedSeverity}` : ''}`
                ).then((r) => r.json()),
                fetch(
                    `${API_BASE}/api/data_quality/anomalies?limit=20&include_excluded=${includeExcluded}`
                ).then((r) => r.json()),
            ]);

            if (coverageRes.status === 'fulfilled' && coverageRes.value) {
                setCoverage(coverageRes.value);
            } else {
                console.error('Coverage fetch failed:', coverageRes.status === 'rejected' ? coverageRes.reason : 'Invalid response');
            }

            if (invariantsRes.status === 'fulfilled' && invariantsRes.value) {
                setInvariants(invariantsRes.value);
            } else {
                console.error('Invariants fetch failed:', invariantsRes.status === 'rejected' ? invariantsRes.reason : 'Invalid response');
            }

            if (anomaliesRes.status === 'fulfilled' && anomaliesRes.value) {
                setAnomalies(anomaliesRes.value);
            } else {
                console.error('Anomalies fetch failed:', anomaliesRes.status === 'rejected' ? anomaliesRes.reason : 'Invalid response');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch data quality metrics');
        } finally {
            setLoading(false);
        }
    };

    const getIntegrityColor = (score: number): string => {
        if (score >= 90) return 'text-emerald-400';
        if (score >= 70) return 'text-yellow-400';
        return 'text-red-400';
    };

    const getSeverityIcon = (severity: string, passed?: boolean) => {
        if (passed === true) return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
        if (passed === false) return <XCircle className="w-4 h-4 text-red-400" />;

        switch (severity) {
            case 'CRITICAL':
                return <AlertTriangle className="w-4 h-4 text-red-400" />;
            case 'WARNING':
                return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
            case 'INFO':
                return <Info className="w-4 h-4 text-blue-400" />;
            default:
                return null;
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-neutral-400">Loading data quality metrics...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <div className="flex items-center gap-2 text-red-400">
                    <AlertTriangle className="w-5 h-5" />
                    <span>{error}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-neutral-100">Data Quality Dashboard</h2>
                    <p className="text-sm text-neutral-400 mt-1">
                        Foundation check: garbage in = garbage out
                    </p>
                </div>
                <button
                    onClick={fetchData}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                    Refresh
                </button>
            </div>

            {/* Summary Cards */}
            {coverage?.summary && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-lg p-4">
                        <div className="text-xs text-neutral-400 uppercase mb-1">Runs Analyzed</div>
                        <div className="text-2xl font-bold text-neutral-100">
                            {coverage.summary.runs_analyzed ?? 0}
                        </div>
                    </div>
                    <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-lg p-4">
                        <div className="text-xs text-neutral-400 uppercase mb-1">Avg Integrity</div>
                        <div
                            className={`text-2xl font-bold ${getIntegrityColor(
                                coverage.summary.avg_integrity_score ?? 0
                            )}`}
                        >
                            {(coverage.summary.avg_integrity_score ?? 0).toFixed(1)}%
                        </div>
                    </div>
                    <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-lg p-4">
                        <div className="text-xs text-neutral-400 uppercase mb-1">Total Trades</div>
                        <div className="text-2xl font-bold text-neutral-100">
                            {coverage.summary.total_trades ?? 0}
                        </div>
                    </div>
                    <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-lg p-4">
                        <div className="text-xs text-neutral-400 uppercase mb-1">Orphans</div>
                        <div className="text-2xl font-bold text-red-400">
                            {coverage.summary.total_orphans ?? 0}
                        </div>
                    </div>
                </div>
            )}

            {/* Run Coverage Table */}
            {coverage?.run_coverage && coverage.run_coverage.length > 0 && (
                <div className="bg-neutral-800/30 border border-neutral-700/50 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-neutral-800/50 border-b border-neutral-700/50">
                        <h3 className="text-lg font-semibold text-neutral-100">Run Coverage</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-neutral-800/30">
                                <tr className="text-neutral-400 text-xs uppercase">
                                    <th className="px-4 py-3 text-left">Run ID</th>
                                    <th className="px-4 py-3 text-right">Shocks</th>
                                    <th className="px-4 py-3 text-right">Signals</th>
                                    <th className="px-4 py-3 text-right">Trades</th>
                                    <th className="px-4 py-3 text-right">Orphans</th>
                                    <th className="px-4 py-3 text-right">Missing Exits</th>
                                    <th className="px-4 py-3 text-right">Integrity</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-700/30">
                                {coverage.run_coverage.map((run) => (
                                    <tr key={run.run_id} className="hover:bg-neutral-800/30 transition-colors">
                                        <td className="px-4 py-3 text-neutral-300 font-mono text-xs">
                                            {run.run_id.substring(0, 12)}...
                                        </td>
                                        <td className="px-4 py-3 text-right text-neutral-300">{run.shocks_count}</td>
                                        <td className="px-4 py-3 text-right text-neutral-300">{run.signals_count}</td>
                                        <td className="px-4 py-3 text-right text-neutral-300">{run.trades_count}</td>
                                        <td className="px-4 py-3 text-right">
                                            <span
                                                className={
                                                    run.orphan_trades_count > 0 ? 'text-red-400 font-bold' : 'text-neutral-500'
                                                }
                                            >
                                                {run.orphan_trades_count}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span
                                                className={
                                                    run.missing_exits_count > 0
                                                        ? 'text-yellow-400 font-bold'
                                                        : 'text-neutral-500'
                                                }
                                            >
                                                {run.missing_exits_count}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className={`font-bold ${getIntegrityColor(run.integrity_score)}`}>
                                                {run.integrity_score.toFixed(0)}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Invariants Validation */}
            {invariants?.invariants && (
                <div className="bg-neutral-800/30 border border-neutral-700/50 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-neutral-800/50 border-b border-neutral-700/50 flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-neutral-100">Invariants Validation</h3>
                        <div className="flex items-center gap-2">
                            <select
                                value={selectedSeverity || ''}
                                onChange={(e) => setSelectedSeverity(e.target.value || null)}
                                className="px-3 py-1 bg-neutral-700 border border-neutral-600 rounded text-neutral-200 text-sm"
                            >
                                <option value="">All Severities</option>
                                <option value="CRITICAL">Critical</option>
                                <option value="WARNING">Warning</option>
                                <option value="INFO">Info</option>
                            </select>
                        </div>
                    </div>
                    <div className="p-4 space-y-2">
                        {invariants.invariants.map((inv, idx) => (
                            <div
                                key={idx}
                                className={`p-3 rounded-lg border ${inv.passed
                                    ? 'bg-emerald-500/10 border-emerald-500/30'
                                    : 'bg-red-500/10 border-red-500/30'
                                    }`}
                            >
                                <div className="flex items-start gap-3">
                                    {getSeverityIcon(inv.severity, inv.passed)}
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-semibold text-neutral-100">{inv.invariant_name}</span>
                                            <span
                                                className={`px-2 py-0.5 rounded text-xs ${inv.severity === 'CRITICAL'
                                                    ? 'bg-red-500/20 text-red-400'
                                                    : inv.severity === 'WARNING'
                                                        ? 'bg-yellow-500/20 text-yellow-400'
                                                        : 'bg-blue-500/20 text-blue-400'
                                                    }`}
                                            >
                                                {inv.severity}
                                            </span>
                                        </div>
                                        <p className="text-sm text-neutral-400">{inv.description}</p>
                                        {!inv.passed && inv.violation_count > 0 && (
                                            <div className="mt-2 text-xs text-neutral-500">
                                                {inv.violation_count} violation{inv.violation_count > 1 ? 's' : ''} detected
                                                {inv.sample_ids.length > 0 && (
                                                    <span className="ml-2">
                                                        (e.g., {inv.sample_ids.slice(0, 3).join(', ')})
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Anomalies Browser */}
            {anomalies?.anomalies && anomalies.anomalies.length > 0 && (
                <div className="bg-neutral-800/30 border border-neutral-700/50 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-neutral-800/50 border-b border-neutral-700/50 flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-neutral-100">Detected Anomalies</h3>
                        <label className="flex items-center gap-2 text-sm text-neutral-400">
                            <input
                                type="checkbox"
                                checked={includeExcluded}
                                onChange={(e) => setIncludeExcluded(e.target.checked)}
                                className="rounded"
                            />
                            Include excluded
                        </label>
                    </div>
                    <div className="divide-y divide-neutral-700/30">
                        {anomalies.anomalies.map((anom, idx) => (
                            <div key={idx} className="p-4 hover:bg-neutral-800/30 transition-colors">
                                <div className="flex items-start gap-3">
                                    <TrendingDown className="w-5 h-5 text-yellow-400 mt-0.5" />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-semibold text-neutral-100">{anom.type}</span>
                                            <span
                                                className={`px-2 py-0.5 rounded text-xs ${anom.severity === 'CRITICAL'
                                                    ? 'bg-red-500/20 text-red-400'
                                                    : anom.severity === 'WARNING'
                                                        ? 'bg-yellow-500/20 text-yellow-400'
                                                        : 'bg-blue-500/20 text-blue-400'
                                                    }`}
                                            >
                                                {anom.severity}
                                            </span>
                                            {anom.exclude_by_default && (
                                                <span className="px-2 py-0.5 rounded text-xs bg-neutral-700 text-neutral-400">
                                                    Auto-excluded
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-neutral-400 mb-2">{anom.description}</p>
                                        <div className="text-xs text-neutral-500">
                                            Run: {anom.run_id.substring(0, 12)}... • Affected: {anom.affected_count}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* No Data Message */}
            {!loading && !coverage?.summary && !invariants?.invariants && !anomalies?.anomalies && (
                <div className="bg-neutral-800/30 border border-neutral-700/50 rounded-lg p-8 text-center">
                    <Info className="w-12 h-12 text-neutral-500 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-neutral-300 mb-2">No Data Available</h3>
                    <p className="text-neutral-400 mb-4">
                        No runs found with data quality metrics. The data quality service may not be initialized.
                    </p>
                    <button
                        onClick={fetchData}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                        Retry
                    </button>
                </div>
            )}
        </div>
    );
};
