/**
 * ExportToolbar.tsx - Reusable export controls for backtest views.
 */

import { useState } from 'react';

interface ExportToolbarProps {
    onExportJSON?: () => Promise<void>;
    onExportHTML?: () => Promise<void>;
    onExportCSV?: () => Promise<void>;
    disabled?: boolean;
}

export function ExportToolbar({ onExportJSON, onExportHTML, onExportCSV, disabled }: ExportToolbarProps) {
    const [busy, setBusy] = useState<string | null>(null);

    const handle = async (format: string, fn?: () => Promise<void>) => {
        if (!fn || busy) return;
        setBusy(format);
        try {
            await fn();
        } finally {
            setBusy(null);
        }
    };

    const btnClass = (format: string) =>
        `px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            busy === format
                ? 'bg-cyan-600 text-white cursor-wait'
                : disabled
                  ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
        }`;

    return (
        <div className="flex items-center gap-2">
            <span className="text-[10px] text-neutral-500 uppercase tracking-wider mr-1">Export</span>
            {onExportJSON && (
                <button className={btnClass('json')} onClick={() => handle('json', onExportJSON)} disabled={disabled || !!busy}>
                    {busy === 'json' ? '...' : 'JSON'}
                </button>
            )}
            {onExportHTML && (
                <button className={btnClass('html')} onClick={() => handle('html', onExportHTML)} disabled={disabled || !!busy}>
                    {busy === 'html' ? '...' : 'HTML'}
                </button>
            )}
            {onExportCSV && (
                <button className={btnClass('csv')} onClick={() => handle('csv', onExportCSV)} disabled={disabled || !!busy}>
                    {busy === 'csv' ? '...' : 'CSV'}
                </button>
            )}
        </div>
    );
}
