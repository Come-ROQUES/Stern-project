import { useEffect, useState } from 'react';
import { formatTime } from "../lib/dateUtils";

interface Run {
    strategy_id: string;
    strategy_version: string;
    trade_date: string;
    run_id: string;
    start_time_utc: string;
    end_time_utc: string | null;
    mode: string;
    status: 'COMPLETE' | 'PARTIAL';
    db_count: number;
    total_size_bytes: number;
    path: string;
}

interface RunVerdict {
    status: string;
    trade_count: number;
    signal_count: number;
    rejection_pct: number;
    duration_minutes: number;
    mode: string;
    intention: string;
}

interface TableInfo {
    database: string;
    table: string;
    columns: string[];
    row_count: number;
    time_range: { min: string; max: string } | null;
    size_bytes: number;
}

interface TablePreview {
    run_id: string;
    database: string;
    table: string;
    columns: string[];
    rows: any[][];
    preview_count: number;
    total_count: number;
}

const API_BASE = 'http://localhost:8001/api';

const TABLE_CATEGORIES = {
    CORE: ['shadow_trades', 'signals'],
    MARKET: ['shock_events'],
    ANALYTICS: ['campaign_snapshots', 'shock_trajectories', 'shock_outcomes'],
};

const TABLE_DESCRIPTIONS: Record<string, string> = {
    'shadow_trades': 'Executed (shadow) trades for this run.',
    'signals': 'All strategy signals, including rejected entries.',
    'shock_events': 'Market shock events detected during this run.',
    'campaign_snapshots': 'Campaign equity snapshots.',
    'shock_trajectories': '200-bar post-shock price trajectories.',
    'shock_outcomes': 'Shock outcome metrics (MFE, MAE, final P&L).',
};

function RunVerdictPanel({ run, verdict }: { run: Run; verdict: RunVerdict | null }) {
    const formatDuration = (minutes: number) => {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${h}h ${m}min`;
    };

    return (
        <div className="card glass">
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-xs uppercase tracking-wider text-neutral-400">RUN VERDICT</div>
                        <div className="mt-1 flex items-center gap-2">
                            <span
                                className={`text-2xl font-bold ${run.status === 'COMPLETE' ? 'text-emerald-400' : 'text-amber-400'
                                    }`}
                            >
                                {run.status}
                            </span>
                            <span className="text-sm text-neutral-400">
                                {run.status === 'COMPLETE' ? 'CHECK' : 'PARTIAL'}
                            </span>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-neutral-400">Mode</div>
                        <div className="text-sm font-semibold uppercase text-white">{run.mode}</div>
                    </div>
                </div>

                <div className="h-px bg-white/10" />

                {verdict && (
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <div className="text-xs text-neutral-400">Trades</div>
                            <div className="text-xl font-bold text-white">{verdict.trade_count}</div>
                        </div>
                        <div>
                            <div className="text-xs text-neutral-400">Signals</div>
                            <div className="text-xl font-bold text-white">{verdict.signal_count}</div>
                        </div>
                        <div>
                            <div className="text-xs text-neutral-400">Rejected</div>
                            <div className="text-xl font-bold text-amber-400">
                                {verdict.rejection_pct.toFixed(1)}%
                            </div>
                        </div>
                    </div>
                )}

                <div className="h-px bg-white/10" />

                <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                        <span className="text-neutral-400">Duration:</span>{' '}
                        <span className="font-semibold text-white">
                            {verdict ? formatDuration(verdict.duration_minutes) : 'N/A'}
                        </span>
                    </div>
                    <div>
                        <span className="text-neutral-400">Status:</span>{' '}
                        <span className="font-semibold text-white">
                            {verdict?.intention || 'Observation only'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function TableGrouped({
    tables,
    selectedTable,
    onSelectTable,
}: {
    tables: TableInfo[];
    selectedTable: TableInfo | null;
    onSelectTable: (table: TableInfo) => void;
}) {
    const grouped: Record<string, TableInfo[]> = {
        CORE: [],
        MARKET: [],
        ANALYTICS: [],
    };

    tables.forEach((tbl) => {
        const key = `${tbl.database}/${tbl.table}`;
        if (TABLE_CATEGORIES.CORE.includes(tbl.table)) {
            grouped.CORE.push(tbl);
        } else if (TABLE_CATEGORIES.MARKET.includes(tbl.table)) {
            grouped.MARKET.push(tbl);
        } else if (TABLE_CATEGORIES.ANALYTICS.includes(tbl.table)) {
            grouped.ANALYTICS.push(tbl);
        }
    });

    return (
        <div className="space-y-4">
            {Object.entries(grouped).map(([category, tbls]) =>
                tbls.length > 0 ? (
                    <div key={category}>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                            {category}
                        </div>
                        <div className="space-y-1">
                            {tbls.map((tbl, idx) => {
                                const isSelected =
                                    selectedTable?.database === tbl.database &&
                                    selectedTable?.table === tbl.table;
                                const desc = TABLE_DESCRIPTIONS[tbl.table] || 'No description available';
                                return (
                                    <div
                                        key={idx}
                                        className={`cursor-pointer rounded-lg border p-3 transition-all ${isSelected
                                                ? 'border-emerald-400/50 bg-emerald-400/10'
                                                : 'border-white/10 bg-white/5 hover:border-white/20'
                                            }`}
                                        onClick={() => onSelectTable(tbl)}
                                    >
                                        <div className="text-sm font-semibold text-white">
                                            {tbl.database}/{tbl.table}
                                        </div>
                                        <div className="mt-1 text-xs text-neutral-300">{desc}</div>
                                        <div className="mt-2 text-xs text-neutral-400">
                                            {tbl.row_count.toLocaleString()} rows
                                            {tbl.time_range && (
                                                <>
                                                    {' '}
                                                    | {formatTime(tbl.time_range.min, "UTC")} →{' '}
                                                    {formatTime(tbl.time_range.max, "UTC")} UTC
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : null
            )}
        </div>
    );
}

export function DatabasePanel() {
    const [viewMode, setViewMode] = useState<'overview' | 'raw'>('overview');
    const [runs, setRuns] = useState<Run[]>([]);
    const [selectedRun, setSelectedRun] = useState<Run | null>(null);
    const [verdict, setVerdict] = useState<RunVerdict | null>(null);
    const [tables, setTables] = useState<TableInfo[]>([]);
    const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null);
    const [preview, setPreview] = useState<TablePreview | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetch(`${API_BASE}/runs`)
            .then((res) => res.json())
            .then((data) => {
                setRuns(data.runs || []);
                if (data.runs && data.runs.length > 0) {
                    handleSelectRun(data.runs[0]);
                }
            })
            .catch(console.error);
    }, []);

    const handleSelectRun = async (run: Run) => {
        setLoading(true);
        setSelectedRun(run);
        setSelectedTable(null);
        setPreview(null);

        try {
            const tablesRes = await fetch(`${API_BASE}/runs/${run.run_id}/tables`);
            const tablesData = await tablesRes.json();
            setTables(tablesData.tables || []);

            const tradesTable = tablesData.tables?.find(
                (t: TableInfo) => t.table === 'shadow_trades'
            );
            const signalsTable = tablesData.tables?.find((t: TableInfo) => t.table === 'signals');

            const tradeCount = tradesTable?.row_count || 0;
            const signalCount = signalsTable?.row_count || 0;
            const rejectionPct =
                signalCount > 0 ? ((signalCount - tradeCount) / signalCount) * 100 : 0;

            const startTime = new Date(run.start_time_utc);
            const endTime = run.end_time_utc ? new Date(run.end_time_utc) : new Date();
            const durationMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / 60000);

            setVerdict({
                status: run.status,
                trade_count: tradeCount,
                signal_count: signalCount,
                rejection_pct: rejectionPct,
                duration_minutes: durationMinutes,
                mode: run.mode,
                intention: 'This run is strictly observational',
            });
        } catch (err) {
            console.error('Failed to load run data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectTable = async (table: TableInfo) => {
        if (!selectedRun) return;
        setSelectedTable(table);
        setLoading(true);

        try {
            const res = await fetch(
                `${API_BASE}/runs/${selectedRun.run_id}/tables/${table.database}/${table.table}/preview?limit=50`
            );
            const data = await res.json();
            setPreview(data);
        } catch (err) {
            console.error('Failed to load table preview:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadSnapshot = () => {
        if (!selectedRun) return;
        const url = `${API_BASE}/runs/${selectedRun.run_id}/snapshot.zip`;
        window.open(url, '_blank');
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
    };

    return (
        <div className="space-y-4">
            <div className="card glass">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-xs uppercase tracking-wider text-neutral-400">DATABASE</div>
                        <div className="text-lg font-semibold text-white">Run Forensic Tool</div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setViewMode(viewMode === 'overview' ? 'raw' : 'overview')}
                            className="rounded-lg border border-white/20 bg-white/5 px-3 py-1 text-xs text-white hover:bg-white/10"
                        >
                            {viewMode === 'overview' ? 'Switch to Raw Inspection' : 'Back to Overview'}
                        </button>
                        {selectedRun && (
                            <button
                                onClick={handleDownloadSnapshot}
                                className="rounded-lg border border-emerald-400/50 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-400 hover:bg-emerald-400/20"
                            >
                                Download Snapshot
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="card glass">
                <div className="text-xs text-neutral-400 mb-2">RUN SELECTOR</div>
                <select
                    value={selectedRun?.run_id || ''}
                    onChange={(e) => {
                        const run = runs.find((r) => r.run_id === e.target.value);
                        if (run) handleSelectRun(run);
                    }}
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                >
                    {runs.map((r) => (
                        <option key={r.run_id} value={r.run_id}>
                            {r.strategy_id} / {r.strategy_version} / {r.trade_date} /{' '}
                            {r.run_id.slice(0, 8)} ({r.status})
                        </option>
                    ))}
                </select>
            </div>

            {selectedRun && viewMode === 'overview' && (
                <>
                    <RunVerdictPanel run={selectedRun} verdict={verdict} />

                    <div className="grid gap-4 md:grid-cols-3">
                        <button
                            onClick={() => {
                                const tradesTable = tables.find((t) => t.table === 'shadow_trades');
                                if (tradesTable) {
                                    setViewMode('raw');
                                    handleSelectTable(tradesTable);
                                }
                            }}
                            className="card glass text-left hover:border-emerald-400/50"
                        >
                            <div className="text-xs uppercase tracking-wider text-neutral-400">
                                INSPECT TRADES
                            </div>
                            <div className="mt-2 text-lg font-semibold text-white">
                                {verdict?.trade_count || 0} executed
                            </div>
                        </button>

                        <button
                            onClick={() => {
                                const signalsTable = tables.find((t) => t.table === 'signals');
                                if (signalsTable) {
                                    setViewMode('raw');
                                    handleSelectTable(signalsTable);
                                }
                            }}
                            className="card glass text-left hover:border-emerald-400/50"
                        >
                            <div className="text-xs uppercase tracking-wider text-neutral-400">
                                INSPECT SIGNALS
                            </div>
                            <div className="mt-2 text-lg font-semibold text-white">
                                {verdict?.signal_count || 0} generated
                            </div>
                        </button>

                        <button
                            onClick={handleDownloadSnapshot}
                            className="card glass text-left hover:border-emerald-400/50"
                        >
                            <div className="text-xs uppercase tracking-wider text-neutral-400">
                                DOWNLOAD SNAPSHOT
                            </div>
                            <div className="mt-2 text-lg font-semibold text-white">
                                {formatBytes(selectedRun.total_size_bytes)}
                            </div>
                        </button>
                    </div>
                </>
            )}

            {selectedRun && viewMode === 'raw' && (
                <div className="grid gap-4 md:grid-cols-[320px_1fr]">
                    <div className="card glass">
                        <div className="mb-3 text-xs uppercase tracking-wider text-neutral-400">TABLES</div>
                        <TableGrouped
                            tables={tables}
                            selectedTable={selectedTable}
                            onSelectTable={handleSelectTable}
                        />
                    </div>

                    <div className="card glass">
                        <div className="mb-3 text-xs uppercase tracking-wider text-neutral-400">
                            TABLE PREVIEW
                        </div>
                        {loading && <div className="text-sm text-neutral-400">Loading...</div>}
                        {!loading && !selectedTable && (
                            <div className="text-sm text-neutral-400">Select a table to preview</div>
                        )}
                        {!loading && preview && (
                            <div>
                                <div className="mb-2 text-xs text-neutral-400">
                                    Showing {preview.preview_count} of {preview.total_count.toLocaleString()}{' '}
                                    rows
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="border-b border-white/10">
                                                {preview.columns.map((col, idx) => (
                                                    <th
                                                        key={idx}
                                                        className="px-2 py-2 text-left font-semibold text-neutral-300"
                                                    >
                                                        {col}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {preview.rows.map((row, rowIdx) => (
                                                <tr key={rowIdx} className="border-b border-white/5 hover:bg-white/5">
                                                    {row.map((cell, cellIdx) => (
                                                        <td key={cellIdx} className="px-2 py-2 text-white">
                                                            {cell !== null ? String(cell) : (
                                                                <span className="text-neutral-500">NULL</span>
                                                            )}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
