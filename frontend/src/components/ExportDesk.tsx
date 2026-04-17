import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { api, type DbSummary, type DbTableMeta } from '../lib/api';
import { cn } from '../lib/utils';
import { useRunId, useRunMeta } from '../lib/useRunContext';

type ExportFormat = 'csv' | 'json';

type CanonicalPreset = {
    id: string;
    label: string;
    dbId: string;
    tableName: string;
};

const CANONICAL_PRESETS: CanonicalPreset[] = [
    { id: 'trades', label: 'Trades', dbId: 'canonical_trades', tableName: 'canonical_trades' },
    { id: 'signals', label: 'Signaux', dbId: 'signals', tableName: 'signals' },
    { id: 'shocks', label: 'Chocs', dbId: 'shocks', tableName: 'shocks' },
    { id: 'runs', label: 'Runs', dbId: 'runs', tableName: 'runs' },
];

function formatValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NaN';
    const str = String(value);
    return str.length > 120 ? `${str.slice(0, 117)}...` : str;
}

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
    const head = columns.join(',');
    const body = rows.map((row) =>
        columns
            .map((column) => {
                const value = row[column];
                if (value === null || value === undefined) return '';
                const str = String(value);
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            })
            .join(',')
    );
    return [head, ...body].join('\n');
}

function downloadText(content: string, filename: string, mime: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

function parseLimit(limitRaw: string): number | undefined {
    if (!limitRaw.trim()) return undefined;
    const parsed = Number(limitRaw);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return Math.floor(parsed);
}

export function ExportDesk() {
    const runId = useRunId();
    const { run } = useRunMeta();

    const [databases, setDatabases] = useState<DbSummary[]>([]);
    const [tables, setTables] = useState<DbTableMeta[]>([]);
    const [selectedDbId, setSelectedDbId] = useState<string>('canonical_trades');
    const [selectedTable, setSelectedTable] = useState<string>('canonical_trades');

    const [columns, setColumns] = useState<string[]>([]);
    const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());

    const [rows, setRows] = useState<Record<string, unknown>[]>([]);
    const [totalRows, setTotalRows] = useState(0);
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(500);
    const [order, setOrder] = useState<'asc' | 'desc'>('desc');

    const [search, setSearch] = useState('');
    const [sortColumn, setSortColumn] = useState<string>('');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    const [fullExportLimitRaw, setFullExportLimitRaw] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const selectedDb = useMemo(
        () => databases.find((db) => db.id === selectedDbId) ?? null,
        [databases, selectedDbId]
    );

    const loadDbIndex = useCallback(async () => {
        const payload = await api.getDbIndex();
        const list = payload.databases || [];
        setDatabases(list);

        const hasCurrent = list.some((db) => db.id === selectedDbId);
        if (hasCurrent) return;

        const preferred = ['canonical_trades', 'signals', 'shocks', 'runs']
            .map((id) => list.find((db) => db.id === id))
            .find(Boolean);
        const fallback = preferred ?? list[0];
        if (fallback) {
            setSelectedDbId(fallback.id);
        }
    }, [selectedDbId]);

    const loadTables = useCallback(async () => {
        if (!selectedDbId) return;
        const list = await api.getDbTables(selectedDbId);
        setTables(list);

        const preferred = CANONICAL_PRESETS.find((p) => p.dbId === selectedDbId)?.tableName;
        const hasCurrent = list.some((table) => table.name === selectedTable);
        if (hasCurrent) return;

        const byPreset = preferred ? list.find((table) => table.name === preferred) : undefined;
        const next = byPreset ?? list[0];
        if (next) {
            setSelectedTable(next.name);
        }
    }, [selectedDbId, selectedTable]);

    const loadRows = useCallback(async () => {
        if (!selectedDbId || !selectedTable) return;
        setLoading(true);
        setError(null);
        try {
            const payload = await api.getDbRows(
                selectedDbId,
                selectedTable,
                pageSize,
                page * pageSize,
                order
            );
            const nextColumns = payload.columns || [];
            const normalizedRows = (payload.rows || []).map((values) => {
                const row: Record<string, unknown> = {};
                nextColumns.forEach((column, index) => {
                    row[column] = values[index];
                });
                return row;
            });
            setColumns(nextColumns);
            setRows(normalizedRows);
            setTotalRows(payload.total || 0);
            setVisibleColumns((prev) => {
                if (prev.size > 0) {
                    const keep = new Set(nextColumns.filter((column) => prev.has(column)));
                    if (keep.size > 0) return keep;
                }
                return new Set(nextColumns);
            });
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Erreur de chargement');
            setColumns([]);
            setRows([]);
            setTotalRows(0);
        } finally {
            setLoading(false);
        }
    }, [selectedDbId, selectedTable, pageSize, page, order]);

    useEffect(() => {
        loadDbIndex().catch(() => {
            setError('Impossible de charger la liste des DB');
        });
    }, [loadDbIndex]);

    useEffect(() => {
        setPage(0);
        loadTables().catch(() => {
            setError('Impossible de charger les tables');
            setTables([]);
        });
    }, [loadTables]);

    useEffect(() => {
        setPage(0);
    }, [selectedTable, pageSize, order]);

    useEffect(() => {
        loadRows().catch(() => {
            setError('Impossible de charger les lignes');
        });
    }, [loadRows]);

    const visibleColumnList = useMemo(
        () => columns.filter((column) => visibleColumns.has(column)),
        [columns, visibleColumns]
    );

    const filteredRows = useMemo(() => {
        const needle = search.trim().toLowerCase();
        if (!needle) return rows;
        return rows.filter((row) =>
            visibleColumnList.some((column) => String(row[column] ?? '').toLowerCase().includes(needle))
        );
    }, [rows, search, visibleColumnList]);

    const sortedRows = useMemo(() => {
        if (!sortColumn || !visibleColumns.has(sortColumn)) return filteredRows;
        return [...filteredRows].sort((a, b) => {
            const left = a[sortColumn];
            const right = b[sortColumn];
            if (left == null && right == null) return 0;
            if (left == null) return 1;
            if (right == null) return -1;
            const cmp = String(left).localeCompare(String(right), 'fr', { numeric: true });
            return sortDirection === 'asc' ? cmp : -cmp;
        });
    }, [filteredRows, sortColumn, sortDirection, visibleColumns]);

    const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));

    const handlePreset = (preset: CanonicalPreset): void => {
        setSelectedDbId(preset.dbId);
        setSelectedTable(preset.tableName);
        setSortColumn('');
        setSearch('');
    };

    const toggleColumn = (column: string): void => {
        setVisibleColumns((prev) => {
            const next = new Set(prev);
            if (next.has(column)) {
                if (next.size === 1) return prev;
                next.delete(column);
            } else {
                next.add(column);
            }
            return next;
        });
    };

    const exportCurrentPage = (format: ExportFormat): void => {
        const exportColumns = visibleColumnList;
        const exportRows = sortedRows.map((row) => {
            const out: Record<string, unknown> = {};
            exportColumns.forEach((column) => {
                out[column] = row[column];
            });
            return out;
        });

        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        const baseName = `${selectedDbId}_${selectedTable}_page_${page + 1}_${stamp}`;
        if (format === 'csv') {
            downloadText(toCsv(exportRows, exportColumns), `${baseName}.csv`, 'text/csv;charset=utf-8;');
            return;
        }
        downloadText(JSON.stringify(exportRows, null, 2), `${baseName}.json`, 'application/json');
    };

    const exportFullTable = (format: ExportFormat): void => {
        const limit = parseLimit(fullExportLimitRaw);
        const url = api.getDbExportUrl(selectedDbId, selectedTable, format, limit);
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const dbCanonicalBadge =
        selectedDbId === 'canonical_trades' ||
        selectedDbId === 'signals' ||
        selectedDbId === 'shocks' ||
        selectedDbId === 'runs';

    return (
        <div className="flex h-full min-h-0 flex-col bg-transparent">
            <div className="flex-none border-b border-white/[0.08] px-4 py-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold tracking-wide text-white/85">Export Desk</h2>
                    {dbCanonicalBadge && (
                        <span className="rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-cyan-300">
                            Canonical
                        </span>
                    )}
                    <span className="text-xs text-neutral-500">
                        run: {runId ? runId.slice(0, 12) : 'n/a'} | strategy: {run?.strategy_id ?? 'n/a'}
                    </span>
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                    {CANONICAL_PRESETS.map((preset) => (
                        <button
                            key={preset.id}
                            onClick={() => handlePreset(preset)}
                            className={cn(
                                'rounded-lg border px-3 py-1 text-xs font-medium transition-colors',
                                selectedDbId === preset.dbId && selectedTable === preset.tableName
                                    ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200'
                                    : 'border-white/10 text-neutral-400 hover:border-white/20 hover:text-neutral-200'
                            )}
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] uppercase tracking-wider text-neutral-500">Database</span>
                        <select
                            value={selectedDbId}
                            onChange={(event) => setSelectedDbId(event.target.value)}
                            className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-neutral-200"
                        >
                            {databases.map((db) => (
                                <option key={db.id} value={db.id}>
                                    {db.id} ({db.tables.length} tables)
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] uppercase tracking-wider text-neutral-500">Table</span>
                        <select
                            value={selectedTable}
                            onChange={(event) => setSelectedTable(event.target.value)}
                            className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-neutral-200"
                        >
                            {tables.map((table) => (
                                <option key={table.name} value={table.name}>
                                    {table.name} ({table.rows.toLocaleString()})
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] uppercase tracking-wider text-neutral-500">Page size</span>
                        <select
                            value={String(pageSize)}
                            onChange={(event) => setPageSize(Number(event.target.value))}
                            className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-neutral-200"
                        >
                            <option value="100">100</option>
                            <option value="500">500</option>
                            <option value="1000">1000</option>
                            <option value="5000">5000</option>
                        </select>
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] uppercase tracking-wider text-neutral-500">Order rowid</span>
                        <select
                            value={order}
                            onChange={(event) => setOrder(event.target.value as 'asc' | 'desc')}
                            className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-neutral-200"
                        >
                            <option value="desc">DESC</option>
                            <option value="asc">ASC</option>
                        </select>
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] uppercase tracking-wider text-neutral-500">Recherche page</span>
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Filtre local..."
                            className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600"
                        />
                    </label>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                        onClick={() => loadRows()}
                        disabled={loading}
                        className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/[0.06] disabled:opacity-40"
                    >
                        {loading ? 'Chargement...' : 'Recharger'}
                    </button>

                    <button
                        onClick={() => exportCurrentPage('csv')}
                        disabled={rows.length === 0 || visibleColumnList.length === 0}
                        className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/[0.06] disabled:opacity-40"
                    >
                        Export page CSV
                    </button>

                    <button
                        onClick={() => exportCurrentPage('json')}
                        disabled={rows.length === 0 || visibleColumnList.length === 0}
                        className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/[0.06] disabled:opacity-40"
                    >
                        Export page JSON
                    </button>

                    <input
                        value={fullExportLimitRaw}
                        onChange={(event) => setFullExportLimitRaw(event.target.value)}
                        placeholder="limit export full (vide = tout)"
                        className="w-56 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600"
                    />

                    <button
                        onClick={() => exportFullTable('csv')}
                        className="rounded-lg border border-cyan-500/30 bg-cyan-500/15 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/20"
                    >
                        Export table complete CSV
                    </button>

                    <button
                        onClick={() => exportFullTable('json')}
                        className="rounded-lg border border-cyan-500/30 bg-cyan-500/15 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/20"
                    >
                        Export table complete JSON
                    </button>
                </div>

                <div className="mt-2 text-xs text-neutral-500">
                    DB: {selectedDb?.path ?? 'n/a'} | table rows: {totalRows.toLocaleString()} | colonnes: {columns.length}
                </div>
            </div>

            <div className="flex-none border-b border-white/[0.06] px-4 py-2">
                <div className="mb-1 flex flex-wrap items-center gap-1">
                    <span className="mr-2 text-[10px] uppercase tracking-wider text-neutral-600">Colonnes visibles</span>
                    <button
                        onClick={() => setVisibleColumns(new Set(columns))}
                        className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-neutral-400 hover:text-neutral-200"
                    >
                        Tout
                    </button>
                    <button
                        onClick={() => {
                            if (columns[0]) setVisibleColumns(new Set([columns[0]]));
                        }}
                        className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-neutral-400 hover:text-neutral-200"
                    >
                        Min
                    </button>
                </div>
                <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto pr-2">
                    {columns.map((column) => (
                        <button
                            key={column}
                            onClick={() => toggleColumn(column)}
                            className={cn(
                                'rounded border px-2 py-0.5 text-[10px] transition-colors',
                                visibleColumns.has(column)
                                    ? 'border-white/25 bg-white/10 text-neutral-200'
                                    : 'border-white/10 text-neutral-500 hover:text-neutral-300'
                            )}
                        >
                            {column}
                        </button>
                    ))}
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
                {error && (
                    <div className="m-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                        {error}
                    </div>
                )}

                {!error && loading && (
                    <div className="flex h-40 items-center justify-center text-sm text-neutral-500">Chargement...</div>
                )}

                {!error && !loading && visibleColumnList.length === 0 && (
                    <div className="flex h-40 items-center justify-center text-sm text-neutral-500">
                        Aucune colonne visible.
                    </div>
                )}

                {!error && !loading && visibleColumnList.length > 0 && (
                    <table className="w-full border-collapse text-[11px]">
                        <thead className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#0e0e14]">
                            <tr>
                                <th className="w-10 px-2 py-2 text-left text-[10px] text-neutral-600">#</th>
                                {visibleColumnList.map((column) => (
                                    <th
                                        key={column}
                                        onClick={() => {
                                            if (sortColumn === column) {
                                                setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                                            } else {
                                                setSortColumn(column);
                                                setSortDirection('desc');
                                            }
                                        }}
                                        className={cn(
                                            'cursor-pointer whitespace-nowrap px-2 py-2 text-left text-[10px] font-medium text-neutral-500 hover:text-neutral-300',
                                            sortColumn === column && 'text-cyan-300'
                                        )}
                                    >
                                        {column}
                                        {sortColumn === column && (
                                            <span className="ml-1 opacity-70">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                        )}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sortedRows.map((row, index) => (
                                <tr
                                    key={index}
                                    className="border-b border-white/[0.04] hover:bg-white/[0.03]"
                                >
                                    <td className="px-2 py-1.5 font-mono text-neutral-700">
                                        {page * pageSize + index + 1}
                                    </td>
                                    {visibleColumnList.map((column) => (
                                        <td
                                            key={column}
                                            className="whitespace-nowrap px-2 py-1.5 font-mono text-neutral-300"
                                            title={row[column] == null ? '' : String(row[column])}
                                        >
                                            {formatValue(row[column])}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="flex flex-none items-center justify-between border-t border-white/[0.06] px-4 py-2 text-xs text-neutral-500">
                <span>
                    Page {page + 1}/{pageCount} | offset {page * pageSize} | affichées {sortedRows.length}/{rows.length}
                </span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                        disabled={page === 0}
                        className="rounded border border-white/10 px-2 py-0.5 hover:border-white/20 disabled:opacity-30"
                    >
                        Prec.
                    </button>
                    <button
                        onClick={() => setPage((prev) => Math.min(pageCount - 1, prev + 1))}
                        disabled={page >= pageCount - 1}
                        className="rounded border border-white/10 px-2 py-0.5 hover:border-white/20 disabled:opacity-30"
                    >
                        Suiv.
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ExportDesk;
