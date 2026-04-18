import { describe, expect, it } from "vitest";

import { isRecoverableLazyChunkError } from "./chunkRecovery";

describe("isRecoverableLazyChunkError", () => {
  it("detects failed dynamic import errors", () => {
    expect(
      isRecoverableLazyChunkError(
        new Error(
          "Failed to fetch dynamically imported module: https://fractalfx.duckdns.org/react/assets/BacktestLaunch-DHaErkvW.js"
        )
      )
    ).toBe(true);
  });

  it("detects MIME mismatch module errors", () => {
    expect(
      isRecoverableLazyChunkError(
        'Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".'
      )
    ).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isRecoverableLazyChunkError(new Error("Network offline"))).toBe(
      false
    );
  });
});
