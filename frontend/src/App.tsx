import { useState } from "react";
import { useLiveState } from "./lib/useLiveState";
import { TopBar } from "./components/TopBar";
import { OrderBookPanel } from "./components/OrderBookPanel";
import { TradeTapePanel } from "./components/TradeTapePanel";
import { SpreadMetricsPanel } from "./components/SpreadMetricsPanel";
import { MarketMakerPanel } from "./components/MarketMakerPanel";
import { PortfolioPanel } from "./components/PortfolioPanel";
import { RiskPanel } from "./components/RiskPanel";
import { FillsPanel } from "./components/FillsPanel";
import { AnalyticsPanel } from "./components/AnalyticsPanel";
import { cn } from "./lib/cn";

type TabId = "market" | "strategy" | "analytics";

const TABS: { id: TabId; label: string; subtitle: string }[] = [
  { id: "market", label: "Market", subtitle: "Book · trades · depth-spread" },
  { id: "strategy", label: "Strategy", subtitle: "Quote · fills · risk" },
  { id: "analytics", label: "Analytics", subtitle: "Vol · micro · P&L" },
];

export function App() {
  const { data, error, lastTickMs } = useLiveState(750);
  const [tab, setTab] = useState<TabId>("market");

  return (
    <div className="min-h-screen bg-scape text-white">
      <TopBar state={data} error={error} lastTickMs={lastTickMs} />

      <nav className="sticky top-[64px] z-20 backdrop-blur bg-bg/70 border-b border-white/5">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 flex gap-1 overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "relative px-4 py-3 text-sm uppercase tracking-wider mono whitespace-nowrap transition-colors",
                tab === t.id ? "text-cyan-200" : "text-neutral-400 hover:text-neutral-200",
              )}
            >
              {t.label}
              {tab === t.id && (
                <span className="absolute inset-x-3 -bottom-px h-px bg-cyan-300" />
              )}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-[1400px] px-4 sm:px-6 py-5 space-y-4">
        {!data && !error && (
          <div className="grid place-items-center py-24">
            <div className="text-neutral-400 text-sm mono uppercase tracking-wider animate-pulse">
              connecting to coinbase WS…
            </div>
          </div>
        )}

        {data && tab === "market" && <MarketView state={data} />}
        {data && tab === "strategy" && <StrategyView state={data} />}
        {data && tab === "analytics" && <AnalyticsPanel state={data} />}
      </main>

      <footer className="mx-auto max-w-[1400px] px-4 sm:px-6 py-4 text-[11px] text-neutral-600 mono">
        Stern Crypto Desk · paper market making · BTC-USD via Coinbase Advanced Trade WS
      </footer>
    </div>
  );
}

function MarketView({ state }: { state: NonNullable<ReturnType<typeof useLiveState>["data"]> }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-5">
        <OrderBookPanel
          bids={state.book.bids}
          asks={state.book.asks}
          mid={state.mid_price}
        />
      </div>
      <div className="lg:col-span-3">
        <TradeTapePanel trades={state.recent_trades} />
      </div>
      <div className="lg:col-span-4">
        <SpreadMetricsPanel
          metrics={state.spread_metrics}
          history={state.spread_history}
        />
      </div>
    </div>
  );
}

function StrategyView({ state }: { state: NonNullable<ReturnType<typeof useLiveState>["data"]> }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-7">
        <MarketMakerPanel quote={state.quote} strategy={state.strategy} mid={state.mid_price} />
      </div>
      <div className="lg:col-span-5">
        <RiskPanel
          portfolio={state.portfolio}
          strategy={state.strategy}
          riskStatus={state.risk_status}
        />
      </div>
      <div className="lg:col-span-12">
        <PortfolioPanel portfolio={state.portfolio} />
      </div>
      <div className="lg:col-span-12">
        <FillsPanel fills={state.fills} />
      </div>
    </div>
  );
}
