import { describe, expect, it } from "vitest";

import {
  extractIndexAssetFromHtml,
  resolveIndexHtmlPath,
  shouldReloadForStaleIndex,
} from "./buildFreshness";

describe("buildFreshness", () => {
  it("extracts the hashed index asset from react-hosted html", () => {
    expect(
      extractIndexAssetFromHtml(
        '<script type="module" src="/react/assets/index-AbC123.js"></script>'
      )
    ).toBe("index-AbC123.js");
  });

  it("falls back to root-hosted html assets", () => {
    expect(
      extractIndexAssetFromHtml(
        '<script type="module" src="/assets/index-ZyX987.js"></script>'
      )
    ).toBe("index-ZyX987.js");
  });

  it("resolves the html path from the current pathname", () => {
    expect(resolveIndexHtmlPath("/react/#emergency")).toBe("/react/index.html");
    expect(resolveIndexHtmlPath("/")).toBe("/index.html");
  });

  it("flags only real stale-index mismatches", () => {
    expect(
      shouldReloadForStaleIndex("index-old.js", "index-new.js")
    ).toBe(true);
    expect(
      shouldReloadForStaleIndex("index-same.js", "index-same.js")
    ).toBe(false);
    expect(shouldReloadForStaleIndex(null, "index-new.js")).toBe(false);
  });
});
