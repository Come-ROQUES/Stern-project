import type { ApiState } from "../types";

export async function fetchState(signal?: AbortSignal): Promise<ApiState> {
  const response = await fetch("/api/state", { signal });
  if (!response.ok) {
    throw new Error(`API state failed with ${response.status}`);
  }
  return response.json() as Promise<ApiState>;
}

