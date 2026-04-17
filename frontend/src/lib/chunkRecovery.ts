const LAZY_CHUNK_RECOVERY_KEY = "fractal.lazy_chunk_recovery_once";

function normalizeErrorMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message || "";
  if (typeof reason === "string") return reason;
  if (reason && typeof reason === "object" && "message" in reason) {
    return String((reason as { message?: unknown }).message ?? "");
  }
  return "";
}

export function isRecoverableLazyChunkError(reason: unknown): boolean {
  const message = normalizeErrorMessage(reason);
  return (
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Importing a module script failed") ||
    message.includes("Expected a JavaScript-or-Wasm module script") ||
    message.includes("MIME type of \"text/html\"")
  );
}

function recoverLazyChunkOnce(assetHint: string | null = null): void {
  if (typeof window === "undefined") return;
  const recoveryKey = assetHint || "unknown";
  try {
    const previous = sessionStorage.getItem(LAZY_CHUNK_RECOVERY_KEY);
    if (previous === recoveryKey) {
      return;
    }
    sessionStorage.setItem(LAZY_CHUNK_RECOVERY_KEY, recoveryKey);
  } catch {
    return;
  }
  window.location.reload();
}

export function installLazyChunkRecovery(): void {
  if (typeof window === "undefined") return;
  const marker = "__fractal_lazy_chunk_recovery_installed";
  if ((window as typeof window & { [key: string]: unknown })[marker]) {
    return;
  }
  (window as typeof window & { [key: string]: unknown })[marker] = true;

  window.addEventListener(
    "error",
    (event) => {
      const target = event.target as HTMLScriptElement | null;
      if (
        target?.tagName === "SCRIPT" &&
        target.type === "module" &&
        target.src.includes("/assets/")
      ) {
        recoverLazyChunkOnce(target.src);
      }
    },
    true
  );

  window.addEventListener("unhandledrejection", (event) => {
    if (!isRecoverableLazyChunkError(event.reason)) return;
    const message = normalizeErrorMessage(event.reason);
    const assetMatch = message.match(/https?:\/\/[^\s)"']+\/assets\/[^\s)"']+\.js/i);
    recoverLazyChunkOnce(assetMatch?.[0] ?? null);
  });
}
