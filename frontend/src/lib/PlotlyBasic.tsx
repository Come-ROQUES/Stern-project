import React, { useEffect, useMemo, useRef, useState } from "react";

import { loadPlotlyRuntime } from "./plotlyRuntime";

type PlotlyBasicProps = {
  data: any[];
  layout?: any;
  config?: any;
  frames?: any[];
  className?: string;
  style?: React.CSSProperties;
  onInitialized?: (
    figure: Readonly<{ data: any[]; layout: any }>,
    graphDiv: HTMLElement
  ) => void;
  onUpdate?: (
    figure: Readonly<{ data: any[]; layout: any }>,
    graphDiv: HTMLElement
  ) => void;
  onPurge?: (
    figure: Readonly<{ data: any[]; layout: any }>,
    graphDiv: HTMLElement
  ) => void;
  onClick?: (event: any) => void;
  onHover?: (event: any) => void;
  onUnhover?: (event: any) => void;
  onSelected?: (event: any) => void;
  onRelayout?: (event: any) => void;
};

function getFigure(data: any[], layout: any) {
  return {
    data,
    layout,
  };
}

export default function PlotlyBasic({
  data,
  layout,
  config,
  frames,
  className,
  style,
  onInitialized,
  onUpdate,
  onPurge,
  onClick,
  onHover,
  onUnhover,
  onSelected,
  onRelayout,
}: PlotlyBasicProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const plotlyRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  const onInitializedRef = useRef(onInitialized);
  const onUpdateRef = useRef(onUpdate);
  const onPurgeRef = useRef(onPurge);
  const onClickRef = useRef(onClick);
  const onHoverRef = useRef(onHover);
  const onUnhoverRef = useRef(onUnhover);
  const onSelectedRef = useRef(onSelected);
  const onRelayoutRef = useRef(onRelayout);

  onInitializedRef.current = onInitialized;
  onUpdateRef.current = onUpdate;
  onPurgeRef.current = onPurge;
  onClickRef.current = onClick;
  onHoverRef.current = onHover;
  onUnhoverRef.current = onUnhover;
  onSelectedRef.current = onSelected;
  onRelayoutRef.current = onRelayout;

  const mergedConfig = useMemo(
    () => ({ responsive: true, displaylogo: false, ...(config || {}) }),
    [config]
  );

  useEffect(() => {
    let mounted = true;
    loadPlotlyRuntime()
      .then((Plotly) => {
        if (!mounted || !ref.current) return;
        plotlyRef.current = Plotly;
        setReady(true);
        return Plotly.react(ref.current, data, layout, mergedConfig, frames);
      })
      .then(() => {
        if (!mounted || !ref.current || !plotlyRef.current) return;
        const el = ref.current as any;
        if (el && typeof el.on === "function") {
          el.on("plotly_click", (event: any) => onClickRef.current?.(event));
          el.on("plotly_hover", (event: any) => onHoverRef.current?.(event));
          el.on("plotly_unhover", (event: any) => onUnhoverRef.current?.(event));
          el.on("plotly_selected", (event: any) => onSelectedRef.current?.(event));
          el.on("plotly_relayout", (event: any) => onRelayoutRef.current?.(event));
        }
        onInitializedRef.current?.(getFigure(data, layout), ref.current);
      })
      .catch(() => {
        if (mounted) {
          setReady(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!ready || !ref.current || !plotlyRef.current) return;
    let cancelled = false;
    plotlyRef.current
      .react(ref.current, data, layout, mergedConfig, frames)
      .then(() => {
        if (cancelled || !ref.current) return;
        onUpdateRef.current?.(getFigure(data, layout), ref.current);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ready, data, layout, mergedConfig, frames]);

  useEffect(() => {
    return () => {
      const el = ref.current as any;
      if (el && typeof el.removeAllListeners === "function") {
        el.removeAllListeners("plotly_click");
        el.removeAllListeners("plotly_hover");
        el.removeAllListeners("plotly_unhover");
        el.removeAllListeners("plotly_selected");
        el.removeAllListeners("plotly_relayout");
      }
      if (ref.current && plotlyRef.current?.purge) {
        onPurgeRef.current?.(getFigure(data, layout), ref.current);
        plotlyRef.current.purge(ref.current);
      }
      plotlyRef.current = null;
    };
  }, [data, layout]);

  return (
    <div ref={ref} className={className} style={style}>
      {!ready && (
        <div className="text-xs text-neutral-500">Loading Plotly…</div>
      )}
    </div>
  );
}
