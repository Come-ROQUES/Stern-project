import React from "react";
import { type TimeframeOption } from "../../lib/aggregateCandles";

type Props = {
  options: (TimeframeOption & { disabled?: boolean })[];
  active: string;
  onChange: (tf: TimeframeOption) => void;
};

export function TimeframeSelector({ options, active, onChange }: Props) {
  return (
    <div className="inline-flex rounded-md border border-white/10 bg-black/30">
      {options.map((tf) => (
        <button
          key={tf.label}
          onClick={() => !tf.disabled && onChange(tf)}
          disabled={tf.disabled}
          title={tf.disabled ? "Resolution unavailable for this feed" : undefined}
          className={`px-2 py-1 text-[11px] ${
            tf.label === active
              ? "bg-white/15 text-white"
              : tf.disabled
                ? "text-neutral-600 cursor-not-allowed"
                : "text-neutral-400 hover:text-white"
          }`}
        >
          {tf.label}
        </button>
      ))}
    </div>
  );
}
