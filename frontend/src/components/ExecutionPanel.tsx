import { useEffect, useState } from "react";
import { api, StrategyConfig } from "../lib/api";

export function ExecutionPanel() {
  const [cfg, setCfg] = useState<StrategyConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const tp = (cfg as any)?.take_profit_mult ?? null;
  const sl = cfg?.stop_loss_mult ?? null;
  const damping = cfg?.damping ?? null;
  const maxBars = cfg?.max_holding_bars ?? null;
  const minTpPips = (cfg as any)?.min_tp_pips ?? null;
  const minAmpPips = (cfg as any)?.min_shock_amplitude_pips ?? null;

  useEffect(() => {
    api
      .getStrategyConfig()
      .then(setCfg)
      .catch((e: any) => setError(e.message || "Failed to load execution config"));
  }, []);

  return (
    <div className="card space-y-3">
      <div>
        <div className="text-xs text-slate-400">Execution Lab</div>
        <div className="text-lg font-semibold">Stratégie & exécution</div>
        <p className="text-sm text-slate-400">
          Paramètres live du moteur : TP/SL, damping, holding max, slippage et scaling risk. Éditable via API key.
        </p>
        {error && <div className="text-xs text-danger">Failed to load: {error}</div>}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryTile
          title="Setup prix"
          body={`${tp ?? "n/a"} TP · ${sl ?? "n/a"} SL · damping ${damping ?? "n/a"}`}
          hint={`${maxBars ? `Holding max ${maxBars} bars` : "Holding max n/a"}${minTpPips ? ` · TP min ${minTpPips}p` : ""}${minAmpPips ? ` · Min shock ${minAmpPips}p` : ""}`}
        />
        <SummaryTile
          title="Coûts / friction"
          body={`${cfg?.slippage_bps ?? "n/a"} bps slippage · spread x session`}
          hint={
            cfg?.spread_multiplier
              ? Object.entries(cfg.spread_multiplier)
                  .map(([k, v]) => `${k}:${v}`)
                  .join(" · ")
              : "multipliers n/a"
          }
        />
        <SummaryTile
          title="Risk scaling"
          body={`risk ${cfg?.risk_pct ?? "n/a"}% · scale ${String((cfg as any)?.risk_scale_min ?? "n/a")}→${String((cfg as any)?.risk_scale_max ?? "n/a")}`}
          hint="Ajuste notionnel par régime"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Editable
          label="Damping"
          value={cfg?.damping}
          step={0.01}
          min={0.01}
          max={0.99}
          onChange={(v) => setCfg((c) => (c ? { ...c, damping: v } : c))}
        />
        <Editable
          label="Max holding (bars)"
          value={cfg?.max_holding_bars}
          step={1}
          min={1}
          max={500}
          onChange={(v) => setCfg((c) => (c ? { ...c, max_holding_bars: v } : c))}
        />
          <Editable
            label="Stop loss mult"
            value={cfg?.stop_loss_mult}
            step={0.05}
            min={0.1}
            max={5}
            onChange={(v) => setCfg((c) => (c ? { ...c, stop_loss_mult: v } : c))}
          />
          <Editable
            label="Take profit mult"
            value={(cfg as any)?.take_profit_mult}
            step={0.05}
            min={0.1}
            max={3}
            onChange={(v) => setCfg((c) => (c ? { ...(c as any), take_profit_mult: v } : c))}
          />
        <Editable
          label="Risk per trade (%)"
          value={cfg?.risk_pct}
          step={0.05}
          min={0.01}
          max={5}
          onChange={(v) => setCfg((c) => (c ? { ...c, risk_pct: v } : c))}
        />
          <Editable
            label="Slippage (bps)"
            value={cfg?.slippage_bps}
            step={0.1}
            min={0}
            max={50}
            onChange={(v) => setCfg((c) => (c ? { ...c, slippage_bps: v } : c))}
          />
          <Editable
            label="Risk scale min"
            value={(cfg as any)?.risk_scale_min}
            step={0.1}
            min={0.1}
            max={5}
            onChange={(v) => setCfg((c) => (c ? { ...(c as any), risk_scale_min: v } : c))}
          />
          <Editable
            label="Risk scale max"
            value={(cfg as any)?.risk_scale_max}
            step={0.1}
            min={0.5}
            max={5}
            onChange={(v) => setCfg((c) => (c ? { ...(c as any), risk_scale_max: v } : c))}
          />
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-neutral-100">
          <div className="text-xs text-neutral-400">Spread multipliers</div>
          <div className="text-xs text-neutral-200">
            {cfg?.spread_multiplier
              ? Object.entries(cfg.spread_multiplier)
                  .map(([k, v]) => `${k}:${v}`)
                  .join(" · ")
              : "n/a"}
          </div>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Pour parité Streamlit : exposer dans l’API les paramètres actuels (damping, max holding, stop,
        risk) et les coûts par trade (commission, slippage) pour calculer P&L explain.
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="password"
          placeholder="API key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white"
        />
        <button
          onClick={async () => {
            if (!cfg) return;
            setSaving(true);
            setMessage(null);
            try {
              const payload = {
                damping: cfg.damping,
                max_holding_bars: cfg.max_holding_bars,
                stop_loss_mult: cfg.stop_loss_mult,
                risk_pct: cfg.risk_pct,
                slippage_bps: cfg.slippage_bps,
                spread_multiplier: cfg.spread_multiplier,
                take_profit_mult: (cfg as any)?.take_profit_mult,
                risk_scale_min: (cfg as any)?.risk_scale_min,
                risk_scale_max: (cfg as any)?.risk_scale_max,
              };
              const res = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:8001"}/api/strategy/config`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(apiKey ? { "X-API-Key": apiKey } : {}),
                },
                body: JSON.stringify(payload),
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              setMessage("Config mise à jour (appliquée au prochain restart du bot)");
            } catch (e: any) {
              setError(e.message || "Échec mise à jour config");
            } finally {
              setSaving(false);
            }
          }}
          className="px-3 py-2 rounded-lg bg-primary text-slate-900 font-semibold text-sm hover:brightness-110 disabled:opacity-50"
          disabled={saving}
        >
          {saving ? "Saving..." : "Appliquer"}
        </button>
        {message && <span className="text-xs text-success">{message}</span>}
      </div>

      {(!cfg || tp == null || sl == null) && (
        <div className="rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Certaines valeurs sont manquantes (TP/SL/damping). Vérifie l’API ou recharge la page avant de trader.
        </div>
      )}
    </div>
  );
}

function Editable({
  label,
  value,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number | null | undefined;
  step: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-neutral-100">
      <div className="text-xs text-neutral-400">{label}</div>
      <input
        type="number"
        value={value ?? ""}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-1 w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white"
      />
    </div>
  );
}

function SummaryTile({ title, body, hint }: { title: string; body: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="text-xs text-neutral-400">{title}</div>
      <div className="text-sm font-semibold text-white mt-1">{body}</div>
      {hint && <div className="text-[11px] text-neutral-500 mt-1">{hint}</div>}
    </div>
  );
}
