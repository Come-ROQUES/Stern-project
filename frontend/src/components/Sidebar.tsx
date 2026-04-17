type SidebarProps = {
  activeTab: string;
  onTabChange: (tab: string) => void;
};

function NavIcon({ id }: { id: string }): JSX.Element {
  switch (id) {
    case "overview":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" />
        </svg>
      );
    case "market":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 8h16M4 12h16M4 16h16M7 5v14M17 5v14" />
        </svg>
      );
    case "strategy":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 17l4-5 4 3 6-8" />
          <path d="M17 7h2v2" />
        </svg>
      );
    case "quant-lab":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 4v4l-5 8a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 16l-5-8V4" />
          <path d="M8 4h8M8 14h8" />
        </svg>
      );
    case "backtest":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h16v12H4z" />
          <path d="M8 10l3 3 5-5" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
        </svg>
      );
  }
}

const tabs = [
  {
    section: "DESK",
    id: "overview",
    title: "Overview",
    badge: "",
  },
  {
    section: "DESK",
    id: "market",
    title: "Market",
    badge: "",
  },
  {
    section: "DESK",
    id: "strategy",
    title: "Strategy",
    badge: "",
  },
  {
    section: "QUANT",
    id: "quant-lab",
    title: "Quant Lab",
    badge: "R",
  },
  {
    section: "BACKTEST",
    id: "backtest",
    title: "Backtest",
    badge: "",
  },
];

const sections = ["DESK", "QUANT", "BACKTEST"] as const;

export function Sidebar({
  activeTab,
  onTabChange,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="eyebrow">Fractal Systems</div>
        <h1>Fractal Crypto</h1>
        <div className="brand-subline">btc-usd / market maker / paper</div>
      </div>

      <nav className="nav">
        {sections.map((section) => (
          <div className="nav-section" key={section}>
            <div className="nav-section-label">
              <span>{section}</span>
              <span>{tabs.filter((tab) => tab.section === section).length}</span>
            </div>
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
                  <span className="nav-icon">
                    <NavIcon id={tab.id} />
                  </span>
                  <strong>{tab.title}</strong>
                  {tab.badge ? <span className="nav-pill">{tab.badge}</span> : null}
                </button>
              ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
