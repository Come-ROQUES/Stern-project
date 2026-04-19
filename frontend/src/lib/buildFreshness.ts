const STALE_INDEX_RECOVERY_KEY = "stern.stale_index_recovery";

export function extractIndexAssetFromHtml(html: string): string | null {
  const match = html.match(/src="\/react\/assets\/(index-[^"]+\.js)"/i);
  if (match?.[1]) return match[1];
  const fallback = html.match(/src="\/assets\/(index-[^"]+\.js)"/i);
  return fallback?.[1] ?? null;
}

export function getLoadedIndexAsset(): string | null {
  if (typeof document === "undefined") return null;
  const script = document.querySelector('script[src*="/assets/index-"]') as
    | HTMLScriptElement
    | null;
  if (!script?.src) return null;
  return script.src.split("/").pop() ?? null;
}

export function resolveIndexHtmlPath(pathname: string): string {
  return pathname.startsWith("/react/") ? "/react/index.html" : "/index.html";
}

export function shouldReloadForStaleIndex(
  loadedAsset: string | null,
  latestAsset: string | null
): boolean {
  return Boolean(loadedAsset && latestAsset && loadedAsset !== latestAsset);
}

export async function ensureFreshIndexAsset(): Promise<boolean> {
  if (typeof window === "undefined") return true;
  const loadedAsset = getLoadedIndexAsset();
  if (!loadedAsset) return true;

  const indexPath = resolveIndexHtmlPath(window.location.pathname);

  try {
    const response = await fetch(indexPath, {
      cache: "no-store",
      credentials: "include",
    });
    if (!response.ok) return true;

    const html = await response.text();
    const latestAsset = extractIndexAssetFromHtml(html);
    if (!shouldReloadForStaleIndex(loadedAsset, latestAsset)) {
      return true;
    }

    const alreadyRecoveredFor = sessionStorage.getItem(STALE_INDEX_RECOVERY_KEY);
    if (alreadyRecoveredFor === latestAsset) {
      return true;
    }

    sessionStorage.setItem(STALE_INDEX_RECOVERY_KEY, latestAsset);
    console.warn(
      `[STALE_BUNDLE] Loaded ${loadedAsset}, latest is ${latestAsset}. Reloading once.`
    );
    window.location.reload();
    return false;
  } catch {
    // Ignore network/storage errors; normal app boot continues.
    return true;
  }
}
