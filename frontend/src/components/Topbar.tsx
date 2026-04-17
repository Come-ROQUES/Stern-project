type TopbarProps = {
  feed: string;
  risk: string;
  quant: string;
  product: string;
  activeTab: string;
  messagesSeen: string;
};

const modeItems = ["terminal", "quant", "backtest"] as const;

function badgeTone(label: string): string {
  if (label.includes("live") || label.includes("nominal") || label.includes("ready")) {
    return "good";
  }
  if (label.includes("risk") || label.includes("booting")) {
    return "warn";
  }
  return "info";
}

export function Topbar({
  feed,
  risk,
  quant,
  product,
  activeTab,
  messagesSeen,
}: TopbarProps) {
  return (
    <section className="topbar">
      <div className="topbar-shell">
        <div className="topbar-title">
          <div className="eyebrow">Trading Desk</div>
          <div className="topbar-runline">
            <h2>{product}</h2>
            <span className="topbar-sep" />
            <span className="topbar-runid">runtime / paper</span>
          </div>
        </div>
        <div className="topbar-controls">
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
          <div className="topbar-meta">
            <span>workspace desk.{activeTab.replace("-", ".")}</span>
            <span className="topbar-meta-sep" />
            <span>site stern-project</span>
            <span className="topbar-meta-sep" />
            <span>messages {messagesSeen}</span>
          </div>
        </div>
        <div className="topbar-right">
          {[feed, risk, quant, "mode public"].map((item) => (
            <div className={`glass-badge glass-badge--${badgeTone(item)}`} key={item}>
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
