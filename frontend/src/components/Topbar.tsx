type TopbarProps = {
  feed: string;
  risk: string;
  product: string;
  activeTab: string;
};

const modeItems = ["terminal", "quant", "backtest"] as const;

export function Topbar({ feed, risk, product, activeTab }: TopbarProps) {
  return (
    <section className="topbar">
      <div className="topbar-shell">
        <div className="topbar-title">
          <div className="eyebrow">Desk Terminal</div>
          <h2>{product}</h2>
        </div>
        <div className="topbar-mode">
          {modeItems.map((item) => (
            <span
              className={`mode-pill ${
                (item === "terminal" &&
                  ["overview", "market", "strategy"].includes(activeTab)) ||
                (item === "quant" && activeTab === "quant-lab") ||
                (item === "backtest" && activeTab === "backtest")
                  ? "active"
                  : ""
              }`}
              key={item}
            >
              {item}
            </span>
          ))}
        </div>
        <div className="topbar-right">
          <div className="glass-badge">{feed}</div>
          <div className="glass-badge">{risk}</div>
          <div className="glass-badge">{activeTab}</div>
        </div>
      </div>
    </section>
  );
}
