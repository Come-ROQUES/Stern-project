import { describe, expect, it, vi } from "vitest";

import {
  buildSignalMetaMap,
  getS3SnapshotErrorMessage,
  shouldShowS3NoData,
  signalMetaKey,
} from "./S3TrendDesk";

describe("signalMetaKey", () => {
  it("utilise signal_id quand disponible", () => {
    const key = signalMetaKey({
      signal_id: "sig-123",
      timestamp: "2026-03-31T09:00:00Z",
      direction: "BUY",
      accepted: true,
      trade_id: null,
    } as any);
    expect(key).toBe("sig-123");
  });

  it("genere une cle stable sans signal_id", () => {
    const key = signalMetaKey({
      signal_id: null,
      timestamp: "2026-03-31T09:00:00Z",
      direction: "SELL",
      accepted: false,
      trade_id: "trade-7",
    } as any);
    expect(key).toBe("2026-03-31T09:00:00Z:SELL:false:trade-7");
  });
});

describe("buildSignalMetaMap", () => {
  it("parse au plus une fois par cle signal", () => {
    const parser = vi.fn((signal: any) => ({ regime_quality: signal.signal_id }));
    const signals = [
      { signal_id: "sig-A", timestamp: "2026-03-31T09:00:00Z", direction: "BUY", accepted: true, trade_id: null },
      { signal_id: "sig-A", timestamp: "2026-03-31T09:00:02Z", direction: "BUY", accepted: true, trade_id: null },
      { signal_id: "sig-B", timestamp: "2026-03-31T09:00:04Z", direction: "SELL", accepted: false, trade_id: "trade-1" },
    ] as any[];

    const map = buildSignalMetaMap(signals, parser);

    expect(parser).toHaveBeenCalledTimes(2);
    expect(map.size).toBe(2);
    expect(map.get("sig-A")).toEqual({ regime_quality: "sig-A" });
    expect(map.get("sig-B")).toEqual({ regime_quality: "sig-B" });
  });
});

describe("getS3SnapshotErrorMessage", () => {
  it("retourne une erreur snapshot explicite pour snapshot_unavailable", () => {
    expect(getS3SnapshotErrorMessage(["snapshot_unavailable"])).toBe(
      "Snapshot S3 indisponible."
    );
  });

  it("retourne une erreur run non resolu pour run_id manquant", () => {
    expect(getS3SnapshotErrorMessage(["s3:run_id_missing"])).toBe(
      "Run S3 non résolu."
    );
  });

  it("retourne null quand aucune erreur s3/snapshot pertinente n'est presente", () => {
    expect(getS3SnapshotErrorMessage(["health:timeout"])).toBeNull();
  });
});

describe("shouldShowS3NoData", () => {
  it("affiche NO DATA uniquement sans erreur et avec zero signaux reels", () => {
    expect(
      shouldShowS3NoData({
        loading: false,
        error: null,
        signalsCount: 0,
        totalSignals: 0,
      })
    ).toBe(true);
  });

  it("n'affiche pas NO DATA quand une erreur snapshot est presente", () => {
    expect(
      shouldShowS3NoData({
        loading: false,
        error: "Snapshot S3 indisponible.",
        signalsCount: 0,
        totalSignals: 0,
      })
    ).toBe(false);
  });

  it("n'affiche pas NO DATA quand signal_stats indique des signaux", () => {
    expect(
      shouldShowS3NoData({
        loading: false,
        error: null,
        signalsCount: 0,
        totalSignals: 12,
      })
    ).toBe(false);
  });
});
