import { describe, expect, it } from "vitest";

import { computeReplayWindow } from "./S3SignalReplayPanel";

describe("computeReplayWindow", () => {
  it("construit une fenetre centree autour du signal selectionne", () => {
    const window = computeReplayWindow("2026-03-31T10:00:00.000Z", 45);
    expect(window).toEqual({
      fromTs: "2026-03-31T09:15:00.000Z",
      toTs: "2026-03-31T10:45:00.000Z",
      key: "2026-03-31T09:15:00.000Z:2026-03-31T10:45:00.000Z",
    });
  });

  it("retourne null pour un timestamp invalide", () => {
    expect(computeReplayWindow("not-a-date")).toBeNull();
  });
});
