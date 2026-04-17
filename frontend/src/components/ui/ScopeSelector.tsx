import React from "react";
import { DataScope, defaultScope } from "../../lib/activeContext";

export function ScopeSelector({
  scope,
  onChange,
  showBadge = true,
  runSelector,
}: {
  scope: DataScope;
  onChange: (s: DataScope) => void;
  showBadge?: boolean;
  runSelector?: React.ReactNode;
}) {
  const options: { label: string; value: DataScope["scope"] }[] = [
    { label: "TODAY", value: "TODAY" },
    { label: "YESTERDAY", value: "YESTERDAY" },
    { label: "PICK A DATE", value: "DATE" },
  ];
  const isHistorical = scope.scope !== "TODAY";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-neutral-300">
        <span>Scope</span>
        <select
          value={scope.scope}
          onChange={(e) => {
            const val = e.target.value as DataScope["scope"];
            if (val === "TODAY") return onChange(defaultScope);
            if (val === "YESTERDAY") return onChange({ scope: "YESTERDAY" });
            return onChange({ scope: "DATE", date: new Date().toISOString().slice(0, 10) });
          }}
          className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {scope.scope === "DATE" && (
          <input
            type="date"
            value={scope.date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => onChange({ scope: "DATE", date: e.target.value })}
            className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white"
          />
        )}
      </div>
      {runSelector}
      {isHistorical && showBadge && (
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-100">
          HISTORICAL VIEW · Scope {scope.scope}
        </div>
      )}
    </div>
  );
}
