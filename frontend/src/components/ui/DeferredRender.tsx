import React, { useEffect, useRef, useState } from "react";

type DeferredRenderProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  minHeight?: number;
  rootMargin?: string;
  once?: boolean;
  className?: string;
};

export function DeferredRender({
  children,
  fallback,
  minHeight = 160,
  rootMargin = "240px 0px",
  once = true,
  className,
}: DeferredRenderProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible && once) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) {
            observer.disconnect();
          }
        } else if (!once) {
          setVisible(false);
        }
      },
      { rootMargin }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [once, rootMargin, visible]);

  return (
    <div ref={ref} className={className} style={{ minHeight }}>
      {visible
        ? children
        : (fallback ?? (
            <div
              className="rounded-xl border border-white/10 bg-white/5"
              style={{ minHeight }}
            />
          ))}
    </div>
  );
}
