type SidebarProps = {
  activeTab: string;
  onTabChange: (tab: string) => void;
  contextHtml: string;
};

const tabs = [
  {
    id: "overview",
    title: "Overview",
    subtitle: "Desk pulse, runtime lanes, equity, verdict",
  },
  {
    id: "market",
    title: "Market",
    subtitle: "Order book, tape, spread lanes, microstructure",
  },
  {
    id: "strategy",
    title: "Strategy",
    subtitle: "Quote engine, fills, inventory, risk guard",
  },
  {
    id: "quant-lab",
    title: "Quant Lab",
    subtitle: "Research presets, regimes, micro-bias, flow",
  },
  {
    id: "backtest",
    title: "Backtest",
    subtitle: "Paper replay lane, equity and P&L diagnostics",
  },
];

export function Sidebar({
  activeTab,
  onTabChange,
  contextHtml,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="eyebrow">Crypto Algo Trading Desk</div>
        <h1>Fractal Crypto</h1>
        <p>
          Mini cockpit crypto reprenant l&apos;ADN visuel de FRACTAL:
          control room, glass panels, quant lab, backtest lane et telemetry
          live.
        </p>
      </div>

      <nav className="nav">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            <strong>{tab.title}</strong>
            <span>{tab.subtitle}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-card">
        <div className="panel-title">Desk Context</div>
        <div
          className="context-block"
          dangerouslySetInnerHTML={{ __html: contextHtml }}
        />
      </div>

      <div className="sidebar-card">
        <div className="panel-title">Workspace</div>
        <div className="workspace-list">
          <div className="workspace-item">
            <strong>desk.overview</strong>
            <span>runtime, pnl, exposure, verdict</span>
          </div>
          <div className="workspace-item">
            <strong>market.micro</strong>
            <span>book, tape, spreads, flow imbalance</span>
          </div>
          <div className="workspace-item">
            <strong>research.quant</strong>
            <span>regimes, presets, signal radar</span>
          </div>
        </div>
      </div>

      <div className="sidebar-card">
        <div className="panel-title">Infra</div>
        <div className="stat-line">
          <span className="label">Site</span>
          <span>stern-project</span>
        </div>
        <div className="stat-line">
          <span className="label">Mode</span>
          <span>paper / public feed</span>
        </div>
        <div className="stat-line">
          <span className="label">Broker auth</span>
          <span>not required</span>
        </div>
      </div>
    </aside>
  );
}
