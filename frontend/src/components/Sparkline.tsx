import { useMemo } from "react";

type Props = {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  baseline?: number | null;
  className?: string;
};

export function Sparkline({
  values,
  width = 160,
  height = 36,
  stroke = "#2ce3ff",
  fill = "rgba(44,227,255,0.12)",
  strokeWidth = 1.5,
  baseline = null,
  className,
}: Props) {
  const path = useMemo(() => {
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const dx = width / (values.length - 1);
    const points = values.map((v, i) => {
      const x = i * dx;
      const y = height - ((v - min) / span) * height;
      return [x, y] as const;
    });
    const line = points
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
      .join(" ");
    const area = `${line} L${width.toFixed(2)},${height} L0,${height} Z`;
    let baselineY: number | null = null;
    if (baseline != null && Number.isFinite(baseline)) {
      baselineY = height - ((baseline - min) / span) * height;
    }
    return { line, area, baselineY };
  }, [values, width, height, baseline]);

  if (!path) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={className}
        aria-hidden
      />
    );
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      aria-hidden
    >
      <path d={path.area} fill={fill} stroke="none" />
      <path
        d={path.line}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {path.baselineY != null && (
        <line
          x1={0}
          x2={width}
          y1={path.baselineY}
          y2={path.baselineY}
          stroke="rgba(255,255,255,0.18)"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
      )}
    </svg>
  );
}
