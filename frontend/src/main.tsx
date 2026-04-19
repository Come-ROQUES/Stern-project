import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ensureFreshIndexAsset } from "./lib/buildFreshness";
import { installLazyChunkRecovery } from "./lib/chunkRecovery";
import { ensureUiStateVersion } from "./lib/uiStateVersion";

// Canvas performance hint: opt-in to willReadFrequently for 2D contexts.
if (
  typeof window !== "undefined" &&
  typeof HTMLCanvasElement !== "undefined" &&
  !(HTMLCanvasElement.prototype as any).__stern_wrf_patched
) {
  (HTMLCanvasElement.prototype as any).__stern_wrf_patched = true;
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  (HTMLCanvasElement.prototype as any).getContext = function (
    contextId: string,
    options?: any
  ): any {
    if (contextId === "2d") {
      const merged = { ...(options || {}), willReadFrequently: true };
      return originalGetContext.call(this, contextId, merged);
    }
    return originalGetContext.call(this, contextId, options);
  };
}

const BUILD_STAMP = (import.meta as any).env?.VITE_BUILD_STAMP ?? "";
ensureUiStateVersion(BUILD_STAMP);

async function bootstrap() {
  // Parallelize the freshness check and the AppV2 chunk download so first paint
  // isn't gated on a serial network waterfall. On stale-index reload the chunk
  // work is wasted, but that's rare and bounded to deploy transitions.
  const freshPromise = ensureFreshIndexAsset();
  const appPromise = import("./AppV2");

  const canBoot = await freshPromise;
  if (!canBoot) {
    return;
  }

  installLazyChunkRecovery();
  const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

  const { AppV2 } = await appPromise;
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <AppV2 />
      </ErrorBoundary>
    </React.StrictMode>
  );
}

bootstrap();
