import { useMemo } from "react";

type Tab = { id: string; label: string };

type TabsNavProps = {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
};

export function TabsNav({ tabs, active, onChange }: TabsNavProps) {
  const ordered = useMemo(() => tabs, [tabs]);
  return (
    <div className="flex flex-col gap-2 py-2">
      {ordered.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`group flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition duration-150 ${
              selected
                ? "bg-[rgba(0,198,255,0.12)] text-white shadow-[0_0_0_1px_rgba(0,198,255,0.35)]"
                : "bg-white/5 text-neutral-200 hover:bg-white/10"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                selected
                  ? "bg-[var(--accent)] shadow-[0_0_10px_rgba(0,198,255,0.9)] scale-100"
                  : "bg-white/30 group-hover:bg-[var(--accent)]"
              } transition duration-150`}
            />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
