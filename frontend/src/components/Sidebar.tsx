type SidebarProps = {
  activeTab: string;
  onTabChange: (tab: string) => void;
  contextHtml: string;
};

const tabs = [
  {
    section: "DESK",
    id: "overview",
    title: "Overview",
    code: "OVR",
  },
  {
    section: "DESK",
    id: "market",
    title: "Market",
    code: "MKT",
  },
  {
    section: "DESK",
    id: "strategy",
    title: "Strategy",
    code: "STR",
  },
  {
    section: "QUANT",
    id: "quant-lab",
    title: "Quant Lab",
    code: "QLB",
  },
  {
    section: "BACKTEST",
    id: "backtest",
    title: "Backtest",
    code: "BKT",
  },
];

const sections = ["DESK", "QUANT", "BACKTEST"] as const;

export function Sidebar({
  activeTab,
  onTabChange,
  contextHtml,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="eyebrow">Fractal Systems</div>
        <h1>Fractal Crypto</h1>
        <div className="brand-subline">BTC-USD / MARKET MAKER / PAPER</div>
      </div>

      <nav className="nav">
        {sections.map((section) => (
          <div className="nav-section" key={section}>
            <div className="nav-section-label">{section}</div>
            {tabs
              .filter((tab) => tab.section === section)
              .map((tab) => (
                <button
                  key={tab.id}
                  className={activeTab === tab.id ? "active" : ""}
                  onClick={() => onTabChange(tab.id)}
                  type="button"
                >
                  <span className="nav-dot" />
                  <strong>{tab.title}</strong>
                  <span className="nav-code">{tab.code}</span>
                </button>
              ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-card">
        <div className="panel-title">Runtime</div>
        <div
          className="context-block"
          dangerouslySetInnerHTML={{ __html: contextHtml }}
        />
      </div>

      <div className="sidebar-card">
        <div className="panel-title">Workspace</div>
        <div className="workspace-grid">
          <span>desk.overview</span>
          <span>market.micro</span>
          <span>strategy.runtime</span>
          <span>quant.regimes</span>
          <span>backtest.replay</span>
          <span>risk.guard</span>
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
