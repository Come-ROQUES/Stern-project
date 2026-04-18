export type ActiveContext = {
  strategy_id: string;
  strategy_version: string;
  trade_date: string;
  run_id: string;
  mode: "paper" | "shadow" | "live" | "dual";
};

const todayParis = new Date().toLocaleDateString("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const activeContext: ActiveContext = {
  strategy_id: import.meta.env.VITE_STRATEGY_ID ?? "damping_wave",
  strategy_version: import.meta.env.VITE_STRATEGY_VERSION ?? "v1",
  trade_date: import.meta.env.VITE_TRADE_DATE ?? todayParis,
  run_id: import.meta.env.VITE_RUN_ID ?? "",
  mode: (import.meta.env.VITE_MODE as ActiveContext["mode"]) ?? "paper",
};

export type DataScope =
  | { scope: "TODAY" }
  | { scope: "YESTERDAY" }
  | { scope: "DATE"; date: string }
  | { scope: "RANGE"; from_date: string; to_date: string };

export const defaultScope: DataScope = { scope: "TODAY" };

export function withContext(url: string, ctx: ActiveContext = activeContext, scope: DataScope = defaultScope): string {
  const [basePath, rawQuery = ""] = url.split("?", 2);
  const params = new URLSearchParams(rawQuery);
  const setIfMissing = (key: string, value: string | undefined) => {
    if (!value || params.has(key)) return;
    params.set(key, value);
  };

  setIfMissing("strategy_id", ctx.strategy_id);
  setIfMissing("strategy_version", ctx.strategy_version);
  setIfMissing("trade_date", ctx.trade_date);
  setIfMissing("mode", ctx.mode);
  setIfMissing("run_id", ctx.run_id || undefined);

  if (!params.has("scope")) {
    if (scope.scope === "YESTERDAY") {
      params.set("scope", "YESTERDAY");
    } else if (scope.scope === "DATE") {
      params.set("scope", "DATE");
      setIfMissing("from_date", scope.date);
      setIfMissing("to_date", scope.date);
    } else if (scope.scope === "RANGE") {
      params.set("scope", "RANGE");
      setIfMissing("from_date", scope.from_date);
      setIfMissing("to_date", scope.to_date);
    } else {
      params.set("scope", "TODAY");
    }
  }

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function deriveContextForScope(ctx: ActiveContext, scope: DataScope): ActiveContext {
  if (scope.scope === "TODAY") return ctx;
  if (scope.scope === "YESTERDAY") {
    const d = new Date(ctx.trade_date);
    d.setDate(d.getDate() - 1);
    return { ...ctx, trade_date: d.toISOString().slice(0, 10) };
  }
  if (scope.scope === "DATE") {
    return { ...ctx, trade_date: scope.date };
  }
  return { ...ctx, trade_date: scope.from_date };
}
