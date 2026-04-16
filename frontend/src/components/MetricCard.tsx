type MetricCardProps = {
  title: string;
  value: string;
  sub: string;
};

export function MetricCard({ title, value, sub }: MetricCardProps) {
  return (
    <article className="glass-panel">
      <div className="panel-inner">
        <div className="panel-label">{title}</div>
        <div className="metric-value">{value}</div>
        <div className="metric-sub">{sub}</div>
      </div>
    </article>
  );
}

