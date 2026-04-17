/**
 * ResearchJournal.tsx — Quant Lab V3 Phase 7
 *
 * Sidebar panel for saving research notes with filter snapshots.
 * Enables reproducible research by storing exact filter states.
 */

import React, { useState, useEffect, useCallback } from "react";
import { useSelection } from "../../lib/SelectionContext";

// API base URL - use relative path for proxy
const API_BASE = '/react-api';

interface JournalEntry {
    id: string;
    title: string;
    notes: string;
    filter_snapshot: Record<string, unknown>;
    created_at: string;
    tags: string[];
    tab: string;
    permalink_hash: string;
}

interface ResearchJournalProps {
    currentTab: string;
    isOpen: boolean;
    onClose: () => void;
}

export function ResearchJournal({ currentTab, isOpen, onClose }: ResearchJournalProps) {
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [allTags, setAllTags] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [filterTag, setFilterTag] = useState<string | null>(null);
    const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);

    const { selection, buildQueryParams } = useSelection();

    // Load entries
    const loadEntries = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterTag) params.set("tag", filterTag);
            params.set("limit", "50");

            const response = await fetch(`${API_BASE}/api/quant/journal/entries?${params}`);
            const data = await response.json();
            setEntries(data.entries || []);
        } catch (error) {
            console.error("Failed to load journal entries:", error);
        } finally {
            setLoading(false);
        }
    }, [filterTag]);

    // Load tags
    const loadTags = useCallback(async () => {
        try {
            const response = await fetch(`${API_BASE}/api/quant/journal/tags`);
            const data = await response.json();
            setAllTags(data.tags || []);
        } catch (error) {
            console.error("Failed to load tags:", error);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            loadEntries();
            loadTags();
        }
    }, [isOpen, loadEntries, loadTags]);

    if (!isOpen) return null;

    return (
        <div className="fixed right-0 top-0 h-full w-96 bg-slate-900 border-l border-slate-700 shadow-xl z-50 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <span>📔</span> Research Journal
                </h2>
                <button
                    onClick={onClose}
                    className="text-slate-400 hover:text-white text-xl"
                >
                    ×
                </button>
            </div>

            {/* Actions */}
            <div className="p-3 border-b border-slate-800 flex gap-2">
                <button
                    onClick={() => setShowCreateForm(true)}
                    className="flex-1 px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-sm font-medium"
                >
                    + Save Current View
                </button>
                <select
                    value={filterTag || ""}
                    onChange={(e) => setFilterTag(e.target.value || null)}
                    className="px-2 py-2 bg-slate-800 text-slate-300 border border-slate-700 rounded text-sm"
                >
                    <option value="">All tags</option>
                    {allTags.map((tag) => (
                        <option key={tag} value={tag}>
                            #{tag}
                        </option>
                    ))}
                </select>
            </div>

            {/* Create Form */}
            {showCreateForm && (
                <CreateEntryForm
                    currentTab={currentTab}
                    filterSnapshot={selection as unknown as Record<string, unknown>}
                    onClose={() => setShowCreateForm(false)}
                    onCreated={() => {
                        setShowCreateForm(false);
                        loadEntries();
                        loadTags();
                    }}
                />
            )}

            {/* Entry List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {loading ? (
                    <div className="text-center text-slate-400 py-8">Loading...</div>
                ) : entries.length === 0 ? (
                    <div className="text-center text-slate-500 py-8">
                        <div className="text-4xl mb-2">📝</div>
                        <div>No journal entries yet</div>
                        <div className="text-xs mt-1">Save your research findings here</div>
                    </div>
                ) : (
                    entries.map((entry) => (
                        <EntryCard
                            key={entry.id}
                            entry={entry}
                            isSelected={selectedEntry?.id === entry.id}
                            onClick={() => setSelectedEntry(entry)}
                            onDelete={async () => {
                                await fetch(`${API_BASE}/api/quant/journal/entries/${entry.id}`, {
                                    method: "DELETE",
                                });
                                loadEntries();
                            }}
                        />
                    ))
                )}
            </div>

            {/* Entry Detail */}
            {selectedEntry && (
                <EntryDetail
                    entry={selectedEntry}
                    onClose={() => setSelectedEntry(null)}
                />
            )}
        </div>
    );
}

// Create Entry Form
function CreateEntryForm({
    currentTab,
    filterSnapshot,
    onClose,
    onCreated,
}: {
    currentTab: string;
    filterSnapshot: Record<string, unknown>;
    onClose: () => void;
    onCreated: () => void;
}) {
    const [title, setTitle] = useState("");
    const [notes, setNotes] = useState("");
    const [tagInput, setTagInput] = useState("");
    const [tags, setTags] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    const handleAddTag = () => {
        if (tagInput.trim() && !tags.includes(tagInput.trim())) {
            setTags([...tags, tagInput.trim()]);
            setTagInput("");
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;

        setSaving(true);
        try {
            await fetch(`${API_BASE}/api/quant/journal/entries`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: title.trim(),
                    notes: notes.trim(),
                    filter_snapshot: filterSnapshot,
                    tab: currentTab,
                    tags,
                }),
            });
            onCreated();
        } catch (error) {
            console.error("Failed to create entry:", error);
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="p-3 border-b border-slate-800 bg-slate-800/50 space-y-3">
            <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-white">New Entry</span>
                <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
                    ×
                </button>
            </div>

            <input
                type="text"
                placeholder="Title (e.g., 'High edge in London tight spread')"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 text-white border border-slate-600 rounded text-sm"
                autoFocus
            />

            <textarea
                placeholder="Notes (observations, hypotheses, next steps...)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-slate-700 text-white border border-slate-600 rounded text-sm resize-none"
            />

            <div className="flex gap-2">
                <input
                    type="text"
                    placeholder="Add tag"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                    className="flex-1 px-2 py-1 bg-slate-700 text-white border border-slate-600 rounded text-xs"
                />
                <button
                    type="button"
                    onClick={handleAddTag}
                    className="px-2 py-1 bg-slate-600 text-white rounded text-xs"
                >
                    +
                </button>
            </div>

            {tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {tags.map((tag) => (
                        <span
                            key={tag}
                            className="px-2 py-0.5 bg-cyan-900/50 text-cyan-300 text-xs rounded flex items-center gap-1"
                        >
                            #{tag}
                            <button
                                type="button"
                                onClick={() => setTags(tags.filter((t) => t !== tag))}
                                className="hover:text-white"
                            >
                                ×
                            </button>
                        </span>
                    ))}
                </div>
            )}

            <div className="text-xs text-slate-500">
                📌 Current filters will be saved with this entry
            </div>

            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-3 py-2 bg-slate-700 text-slate-300 rounded text-sm"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={!title.trim() || saving}
                    className="flex-1 px-3 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 text-white rounded text-sm"
                >
                    {saving ? "Saving..." : "Save Entry"}
                </button>
            </div>
        </form>
    );
}

// Entry Card
function EntryCard({
    entry,
    isSelected,
    onClick,
    onDelete,
}: {
    entry: JournalEntry;
    isSelected: boolean;
    onClick: () => void;
    onDelete: () => void;
}) {
    const date = new Date(entry.created_at);
    const formattedDate = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

    return (
        <div
            onClick={onClick}
            className={`p-3 rounded-lg border cursor-pointer transition-all ${isSelected
                ? "bg-cyan-900/30 border-cyan-600"
                : "bg-slate-800/50 border-slate-700 hover:border-slate-600"
                }`}
        >
            <div className="flex justify-between items-start">
                <h3 className="text-sm font-medium text-white truncate flex-1">
                    {entry.title}
                </h3>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Delete this entry?")) onDelete();
                    }}
                    className="text-slate-500 hover:text-red-400 text-xs ml-2"
                >
                    🗑
                </button>
            </div>

            {entry.notes && (
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">{entry.notes}</p>
            )}

            <div className="flex items-center justify-between mt-2">
                <div className="flex gap-1">
                    {entry.tags.slice(0, 3).map((tag) => (
                        <span
                            key={tag}
                            className="px-1.5 py-0.5 bg-slate-700 text-slate-400 text-[10px] rounded"
                        >
                            #{tag}
                        </span>
                    ))}
                    {entry.tags.length > 3 && (
                        <span className="text-[10px] text-slate-500">+{entry.tags.length - 3}</span>
                    )}
                </div>
                <span className="text-[10px] text-slate-500">{formattedDate}</span>
            </div>
        </div>
    );
}

// Entry Detail Panel
function EntryDetail({
    entry,
    onClose,
}: {
    entry: JournalEntry;
    onClose: () => void;
}) {
    const { selection } = useSelection();

    const copyPermalink = () => {
        const url = `${window.location.origin}/journal/${entry.permalink_hash}`;
        navigator.clipboard.writeText(url);
        alert("Permalink copied!");
    };

    return (
        <div className="border-t border-slate-700 p-4 bg-slate-800/50 max-h-96 overflow-y-auto">
            <div className="flex justify-between items-start mb-3">
                <h3 className="text-sm font-medium text-white">{entry.title}</h3>
                <button onClick={onClose} className="text-slate-400 hover:text-white">
                    ×
                </button>
            </div>

            {entry.notes && (
                <p className="text-xs text-slate-300 mb-3 whitespace-pre-wrap">
                    {entry.notes}
                </p>
            )}

            <div className="space-y-2">
                <div className="text-xs text-slate-500">Saved Filters:</div>
                <pre className="text-[10px] text-slate-400 bg-slate-900 p-2 rounded overflow-x-auto">
                    {JSON.stringify(entry.filter_snapshot, null, 2)}
                </pre>
            </div>

            <div className="flex gap-2 mt-3">
                <button
                    onClick={copyPermalink}
                    className="flex-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-xs"
                >
                    📋 Copy Permalink
                </button>
                <button
                    onClick={() => {
                        // TODO: Implement restore filters
                        alert("Filter restoration coming soon!");
                    }}
                    className="flex-1 px-2 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-xs"
                >
                    ↩️ Restore Filters
                </button>
            </div>
        </div>
    );
}

// Journal Toggle Button (for header)
export function JournalToggleButton({
    onClick,
    hasEntries = false,
}: {
    onClick: () => void;
    hasEntries?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm flex items-center gap-1.5 border border-slate-700"
        >
            📔 Journal
            {hasEntries && (
                <span className="w-2 h-2 bg-cyan-400 rounded-full" />
            )}
        </button>
    );
}
