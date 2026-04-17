import { useEffect, useMemo, useState } from "react";
import { DataScope, defaultScope } from "./activeContext";

type GraphState = {
  timeframe: string;
  scope: DataScope;
  logScale: boolean;
  downsample: boolean;
};

function parseHash(): { path: string; search: URLSearchParams } {
  const hash = window.location.hash || "";
  const [pathPart, searchPart] = hash.replace(/^#/, "").split("?");
  return { path: pathPart || "", search: new URLSearchParams(searchPart || "") };
}

function writeHash(path: string, params: URLSearchParams) {
  const search = params.toString();
  window.location.hash = search ? `${path}?${search}` : path;
}

export function useResearchGraphState(defaults: Partial<GraphState> = {}) {
  const initial = useMemo(() => {
    const { search, path } = parseHash();
    const timeframe = search.get("tf") || defaults.timeframe || "1m";
    const logScale = search.get("log") === "1" || defaults.logScale || false;
    const downsample = search.get("ds") === "1" || defaults.downsample || false;
    const scopeParam = search.get("scope");
    let scope: DataScope = defaults.scope || defaultScope;
    if (scopeParam === "YESTERDAY") scope = { scope: "YESTERDAY" };
    if (scopeParam === "DATE" && search.get("date")) scope = { scope: "DATE", date: search.get("date") || "" };
    return { timeframe, scope, path, logScale, downsample };
  }, [defaults.downsample, defaults.logScale, defaults.scope, defaults.timeframe]);

  const [timeframe, setTimeframe] = useState<string>(initial.timeframe);
  const [scope, setScope] = useState<DataScope>(initial.scope);
  const [logScale, setLogScale] = useState<boolean>(initial.logScale);
  const [downsample, setDownsample] = useState<boolean>(initial.downsample);

  useEffect(() => {
    const handler = () => {
      const { search } = parseHash();
      const tf = search.get("tf");
      if (tf) setTimeframe(tf);
      const scopeParam = search.get("scope");
      if (scopeParam === "YESTERDAY") setScope({ scope: "YESTERDAY" });
      if (scopeParam === "DATE" && search.get("date")) setScope({ scope: "DATE", date: search.get("date") || "" });
      if (!scopeParam) setScope(defaultScope);
      setLogScale(search.get("log") === "1");
      setDownsample(search.get("ds") === "1");
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const updateTimeframe = (tf: string) => {
    setTimeframe(tf);
    const { path, search } = parseHash();
    search.set("tf", tf);
    writeHash(path, search);
  };

  const updateScope = (next: DataScope) => {
    setScope(next);
    const { path, search } = parseHash();
    if (next.scope === "TODAY") {
      search.delete("scope");
      search.delete("date");
    } else if (next.scope === "YESTERDAY") {
      search.set("scope", "YESTERDAY");
      search.delete("date");
    } else if (next.scope === "DATE") {
      search.set("scope", "DATE");
      search.set("date", next.date);
    } else if (next.scope === "RANGE") {
      search.set("scope", "RANGE");
      search.set("from_date", next.from_date);
      search.set("to_date", next.to_date);
    }
    writeHash(path, search);
  };

  const updateLogScale = (v: boolean) => {
    setLogScale(v);
    const { path, search } = parseHash();
    if (v) search.set("log", "1");
    else search.delete("log");
    writeHash(path, search);
  };

  const updateDownsample = (v: boolean) => {
    setDownsample(v);
    const { path, search } = parseHash();
    if (v) search.set("ds", "1");
    else search.delete("ds");
    writeHash(path, search);
  };

  return { timeframe, scope, logScale, downsample, updateTimeframe, updateScope, updateLogScale, updateDownsample };
}
