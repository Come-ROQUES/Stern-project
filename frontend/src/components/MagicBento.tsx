import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

type MagicBentoProps = {
  title: string;
  children: React.ReactNode;
  glowColor?: string;
};

export function MagicBento({ title, children, glowColor = "132, 0, 255" }: MagicBentoProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [spot, setSpot] = useState({ x: 50, y: 50 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      const rx = (y / rect.height) * 6;
      const ry = (-x / rect.width) * 6;
      el.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(0) scale(1.01)`;
      setSpot({
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      });
    };
    const reset = () => {
      el.style.transform = "perspective(800px) rotateX(0deg) rotateY(0deg) translateZ(0) scale(1)";
    };
    gsap.fromTo(
      el,
      { opacity: 0, y: 16, scale: 0.98 },
      { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "power2.out" }
    );

    el.addEventListener("mousemove", handleMove);
    el.addEventListener("mouseleave", reset);
    return () => {
      el.removeEventListener("mousemove", handleMove);
      el.removeEventListener("mouseleave", reset);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl transition-transform duration-200"
    >
      <div
        className="absolute -inset-1 rounded-3xl blur-3xl opacity-60"
        style={{
          background: `radial-gradient(circle at 20% 20%, rgba(${glowColor},0.25), transparent 45%), radial-gradient(circle at 80% 0%, rgba(80, 250, 123, 0.15), transparent 40%)`,
        }}
      />
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-30" />
      <div className="absolute inset-0 pointer-events-none mix-blend-screen bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[pulse_4s_ease_in_out_infinite]" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(240px circle at ${spot.x}% ${spot.y}%, rgba(255,255,255,0.12), transparent 55%)`,
        }}
      />
      <div className="relative z-10 p-5 flex flex-col gap-2">
        <div className="text-neutral-300 text-sm font-medium">{title}</div>
        <div className="text-white text-3xl font-semibold leading-tight">{children}</div>
      </div>
    </div>
  );
}
