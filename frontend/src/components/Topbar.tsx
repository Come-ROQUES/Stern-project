type TopbarProps = {
  feed: string;
  risk: string;
  product: string;
};

export function Topbar({ feed, risk, product }: TopbarProps) {
  return (
    <section className="topbar">
      <div className="hero-shell">
        <div className="eyebrow">Operator Grade Cockpit</div>
        <h2>BTC/USD Desk Terminal</h2>
        <p>
          Version entretien assumee: maximum d&apos;ADN FRACTAL cote rendu,
          hierarchie visuelle et cockpit feeling, mais avec une logique
          simplifiee, publique et autonome pour le market making crypto.
        </p>
        <div className="hero-meta">
          <span className="meta-pill">workspace / live-desk</span>
          <span className="meta-pill">strategy / market-maker</span>
          <span className="meta-pill">research / quant-lab</span>
          <span className="meta-pill">replay / backtest-lite</span>
        </div>
      </div>
      <div className="hero-right">
        <div className="glass-badge">{feed}</div>
        <div className="glass-badge">{risk}</div>
        <div className="glass-badge">{product}</div>
      </div>
    </section>
  );
}
