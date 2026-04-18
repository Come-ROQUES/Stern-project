import { useMemo } from "react";

export type Series = {
  values: number[];
  stroke: string;
  fill?: string;
  label?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
};

type Props = {
  series: Series[];
  height?: number;
  yPadPct?: number;
  showZero?: boolean;
  yFormatter?: (value: number) => string;
  className?: string;
};

const PAD_LEFT = 48;
const PAD_RIGHT = 12;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;
const VIRT_WIDTH = 720;

export function LineChart({
  series,
  height = 220,
  yPadPct = 0.08,
  showZero = false,
  yFormatter,
  className,
}: Props) {
  const layout = useMemo(() => {
    const allValues = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
    if (allValues.length === 0) return null;
    let min = Math.min(...allValues);
    let max = Math.max(...allValues);
    if (showZero) {
      min = Math.min(min, 0);
      max = Math.max(max, 0);
    }
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const pad = (max - min) * yPadPct;
    min -= pad;
    max += pad;
    const span = max - min;
    const innerWidth = VIRT_WIDTH - PAD_LEFT - PAD_RIGHT;
    const innerHeight = height - PAD_TOP - PAD_BOTTOM;
    const yOf = (v: number) =>
      PAD_TOP + innerHeight - ((v - min) / span) * innerHeight;
    const buildPath = (values: number[]) => {
      if (values.length < 2) return null;
      const dx = innerWidth / (values.length - 1);
      let line = "";
      values.forEach((v, i) => {
        const x = PAD_LEFT + i * dx;
        const y = yOf(v);
        line += `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)} `;
      });
      const area =
        `${line}L${(PAD_LEFT + innerWidth).toFixed(2)},${(PAD_TOP + innerHeight).toFixed(2)} ` +
        `L${PAD_LEFT.toFixed(2)},${(PAD_TOP + innerHeight).toFixed(2)} Z`;
      return { line: line.trim(), area };
    };
    const ticks = niceTicks(min, max, 4);
    return { min, max, span, innerHeight, innerWidth, yOf, buildPath, ticks };
  }, [series, height, yPadPct, showZero]);

  if (!layout) {
    return (
      <div
        className={className}
        style={{ height }}
        role="img"
        aria-label="no data"
      />
    );
  }

  return (
    <svg
      viewBox={`0 0 ${VIRT_WIDTH} ${height}`}
      preserveAspectRatio="none"
      className={className}
      style={{ width: "100%", height }}
    >
      {layout.ticks.map((t, i) => {
        const y = layout.yOf(t);
        return (
          <g key={i}>
            <line
              x1={PAD_LEFT}
              x2={VIRT_WIDTH - PAD_RIGHT}
              y1={y}
              y2={y}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
            />
            <text
              x={PAD_LEFT - 8}
              y={y + 3}
              fill="rgba(255,255,255,0.42)"
              fontSize={10}
              textAnchor="end"
              fontFamily="IBM Plex Mono, monospace"
            >
              {yFormatter ? yFormatter(t) : t.toLocaleString()}
            </text>
          </g>
        );
      })}
      {series.map((s, idx) => {
        const path = layout.buildPath(s.values);
        if (!path) return null;
        return (
          <g key={idx}>
            {s.fill && <path d={path.area} fill={s.fill} stroke="none" />}
            <path
              d={path.line}
              fill="none"
              stroke={s.stroke}
              strokeWidth={s.strokeWidth ?? 1.5}
              strokeDasharray={s.strokeDasharray}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        );
      })}
    </svg>
  );
}

function niceTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min];
  const span = max - min;
  const step = niceStep(span / count);
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) {
    ticks.push(Number(v.toFixed(8)));
  }
  return ticks;
}

function niceStep(rough: number): number {
  if (rough <= 0) return 1;
  const exp = Math.floor(Math.log10(rough));
  const base = Math.pow(10, exp);
  const f = rough / base;
  if (f < 1.5) return 1 * base;
  if (f < 3) return 2 * base;
  if (f < 7) return 5 * base;
  return 10 * base;
}
