// Backend contract expectations:
// - /agent/status: fast, no IA call, never blocking.
// - /agent/report/latest: read-only, can return null if none generated.
// - /agent/report/generate and /agent/snapshot: fire-and-forget; respond quickly with { ok: true } (optionally job_id).

export type AgentStatus = {
  timestamp: string;
  age_seconds?: number | null;
  repo: {
    branch: string;
    dirty: boolean;
    ahead: number;
    behind: number;
    status?: string;
  };
  vm: {
    reachable: boolean | null;
    bot_service: string;
    last_heartbeat?: string | null;
    included?: boolean;
  };
  health_score: number | null;
  vm_included?: boolean;
  warnings: string[];
  errors: string[];
};

export type AgentReport = {
  summary: string;
  what_changed: string[];
  risks: string[];
  suggested_actions: string[];
  confidence: number;
  generated_at?: string;
  age_seconds?: number | null;
};

export type AgentActionResponse = { ok: boolean };

const resolveAgentBase = () => {
  const envBase = (import.meta.env.VITE_AGENT_API_BASE_URL || "").trim();
  if (envBase) return envBase.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    try {
      const url = new URL(window.location.origin);
      url.port = "8005"; // default dev port for the agent API
      return url.toString().replace(/\/$/, "");
    } catch (err) {
      // fall through
    }
  }
  return "";
};

export const AGENT_API_BASE = resolveAgentBase();
export const AGENT_API_CONFIGURED = !!AGENT_API_BASE;

async function fetchAgentJson<T>(path: string, init?: RequestInit): Promise<T> {
  if (!AGENT_API_CONFIGURED) {
    throw new Error("Agent API base not configured (set VITE_AGENT_API_BASE_URL)");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(`${AGENT_API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      const snippet = text?.slice(0, 120);
      throw new Error(snippet || `HTTP ${res.status}`);
    }
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      const snippet = text?.slice(0, 120);
      throw new Error(snippet ? `Unexpected response: ${snippet}` : "Unexpected non-JSON response");
    }
    try {
      return JSON.parse(text) as T;
    } catch (err: any) {
      throw new Error(`Invalid JSON response: ${err?.message || text?.slice(0, 120)}`);
    }
  } catch (err: any) {
    const message =
      err?.name === "AbortError" ? "Request timed out" : err?.message || "Network error";
    throw new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

export const agentApi = {
  getStatus: () => fetchAgentJson<AgentStatus>("/agent/status"),
  getLatestReport: () => fetchAgentJson<AgentReport | null>("/agent/report/latest"),
  runSnapshot: () => fetchAgentJson<AgentActionResponse>("/agent/snapshot", { method: "POST" }),
  generateReport: () => fetchAgentJson<AgentActionResponse>("/agent/report/generate", { method: "POST" }),
};
