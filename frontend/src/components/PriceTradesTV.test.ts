import { describe, expect, it } from "vitest";

import {
  buildLiveWindow,
  buildFullRunWindow,
  buildSignalQueryCacheKey,
  computeSignalQueryWindow,
  findSignalsNearTime,
  getSupportedChartTimeframes,
  getLatestTradeTimeSec,
  getChartRightOffsetBars,
  getViewportEndCandidateMs,
  getChartTradesFetchLimit,
  isAbortLikeChartError,
  mergeOhlcBars,
  resolveMinChartTimeframeSeconds,
  snapTimestampToLoadedBarTime,
  selectClosedTradePathTrades,
  summarizeTradesForViewport,
  selectTradesForPanel,
} from "./PriceTradesTV";
import {
  countPending,
  getTopRejectionReasons,
  isPending,
} from "./price-trades/usePriceTradesData";
import { TIMEFRAMES } from "../lib/aggregateCandles";

describe("buildLiveWindow", () => {
  it("ancre la vue live par defaut sur la derniere heure", () => {
    const endMs = Date.parse("2026-03-25T12:00:00.000Z");
    const window = buildLiveWindow(endMs);

    expect(window).toEqual({
      start: "2026-03-25T11:00:00.000Z",
      end: "2026-03-25T12:00:00.000Z",
    });
  });
});

describe("buildFullRunWindow", () => {
  it("ancre le run complet sur les donnees du run sans l etendre jusqu a now", () => {
    const window = buildFullRunWindow(
      {
        start: "2026-03-25T08:00:00.000Z",
        end: "2026-03-25T09:00:00.000Z",
      },
      [
        { timestamp: "2026-03-25T08:10:00.000Z" },
        { timestamp: "2026-03-25T08:55:00.000Z" },
      ] as any[],
      Math.floor(Date.parse("2026-03-25T08:56:00.000Z") / 1000)
    );

    expect(window).toEqual({
      start: "2026-03-25T08:00:00.000Z",
      end: "2026-03-25T09:00:00.000Z",
    });
  });

  it("peut etendre legerement la fin si le dernier trade depasse la derniere bougie", () => {
    const window = buildFullRunWindow(
      {
        start: "2026-03-25T08:00:00.000Z",
        end: "2026-03-25T09:00:00.000Z",
      },
      [
        { timestamp: "2026-03-25T08:10:00.000Z" },
        { timestamp: "2026-03-25T08:55:00.000Z" },
      ] as any[],
      Math.floor(Date.parse("2026-03-25T09:02:00.000Z") / 1000)
    );

    expect(window).toEqual({
      start: "2026-03-25T08:00:00.000Z",
      end: "2026-03-25T09:02:00.000Z",
    });
  });
});

describe("computeSignalQueryWindow", () => {
  it("borne la requete signaux sur le viewport visible", () => {
    const from = Math.floor(
      Date.parse("2026-03-25T09:30:00.000Z") / 1000
    );
    const to = Math.floor(
      Date.parse("2026-03-25T09:35:00.000Z") / 1000
    );
    const window = computeSignalQueryWindow(
      {
        start: "2026-03-25T08:00:00.000Z",
        end: "2026-03-25T12:00:00.000Z",
      },
      {
        from,
        to,
      },
      5
    );

    expect(window).not.toBeNull();
    expect(window?.start).toBe("2026-03-25T09:15:00.000Z");
    expect(window?.end).toBe("2026-03-25T09:50:00.000Z");
  });

  it("retombe sur une fenetre courte en fin de run sans viewport", () => {
    const window = computeSignalQueryWindow(
      {
        start: "2026-03-25T08:00:00.000Z",
        end: "2026-03-25T12:00:00.000Z",
      },
      null,
      5
    );

    expect(window).toEqual({
      start: "2026-03-25T11:15:00.000Z",
      end: "2026-03-25T12:00:00.000Z",
    });
  });
});

describe("buildSignalQueryCacheKey", () => {
  it("bucketise legerement les fenetres voisines pour eviter les refetchs inutiles", () => {
    const keyA = buildSignalQueryCacheKey(
      "run-1",
      "damping_wave",
      {
        start: "2026-03-25T09:15:04.000Z",
        end: "2026-03-25T09:49:58.000Z",
      },
      5
    );
    const keyB = buildSignalQueryCacheKey(
      "run-1",
      "damping_wave",
      {
        start: "2026-03-25T09:15:22.000Z",
        end: "2026-03-25T09:50:11.000Z",
      },
      5
    );

    expect(keyA).toBe(keyB);
  });
});

describe("findSignalsNearTime", () => {
  it("retrouve un signal accepte sur son bucket voisin le plus proche", () => {
    const signal = {
      signal_id: "sig-1",
      timestamp: "2026-03-25T09:30:00.000Z",
      accepted: true,
    } as any;
    const signalsByTime = new Map<number, any[]>([
      [Math.floor(Date.parse(signal.timestamp) / 1000), [signal]],
    ]);

    const found = findSignalsNearTime(
      signalsByTime,
      Math.floor(Date.parse("2026-03-25T09:30:02.000Z") / 1000),
      5
    );

    expect(found).toEqual([signal]);
  });

  it("ignore un bucket trop eloigne du curseur", () => {
    const signalsByTime = new Map<number, any[]>([
      [Math.floor(Date.parse("2026-03-25T09:30:00.000Z") / 1000), [{ signal_id: "sig-1" }]],
    ]);

    const found = findSignalsNearTime(
      signalsByTime,
      Math.floor(Date.parse("2026-03-25T09:30:04.000Z") / 1000),
      5
    );

    expect(found).toBeNull();
  });
});

describe("isPending", () => {
  it("compte seulement un pending reflex encore actif", () => {
    expect(
      isPending({
        signal_id: "sig-pending",
        accepted: true,
        rejection_reason: null,
        decision_stage: "WAITING_REFLEX",
        wait_state: null,
        wait_reason: "WAITING_FOR_REFLEX",
        was_traded: false,
        trade_id: null,
      } as any)
    ).toBe(true);
  });

  it("ignore un waiting historique deja rejete ou deja traite", () => {
    expect(
      isPending({
        signal_id: "sig-rejected",
        accepted: true,
        rejection_reason: "REFLEX_TIMEOUT_REAPER",
        decision_stage: "WAITING_REFLEX",
        wait_state: null,
        wait_reason: "WAITING_FOR_REFLEX",
        was_traded: false,
        trade_id: null,
      } as any)
    ).toBe(false);

    expect(
      isPending({
        signal_id: "sig-traded",
        accepted: true,
        rejection_reason: null,
        decision_stage: "WAITING_REFLEX",
        wait_state: null,
        wait_reason: "WAITING_FOR_REFLEX",
        was_traded: true,
        trade_id: "trade-1",
      } as any)
    ).toBe(false);
  });
});

describe("pending synthesis", () => {
  it("n accroche pas le badge pending sur des lignes historiques cloturees", () => {
    const signals = [
      {
        signal_id: "sig-rejected",
        accepted: true,
        rejection_reason: "REFLEX_TIMEOUT_REAPER",
        decision_stage: "WAITING_REFLEX",
        wait_reason: "WAITING_FOR_REFLEX",
        was_traded: false,
        trade_id: null,
      },
      {
        signal_id: "sig-reject-2",
        accepted: false,
        rejection_reason: "NO_SIGNAL",
        decision_stage: "REJECTED",
        wait_reason: null,
        was_traded: false,
        trade_id: null,
      },
    ] as any[];

    expect(countPending(signals)).toBe(0);
    expect(getTopRejectionReasons(signals)).toEqual([
      { reason: "REFLEX_TIMEOUT_REAPER", count: 1 },
      { reason: "NO_SIGNAL", count: 1 },
    ]);
  });
});

describe("getChartTradesFetchLimit", () => {
  it("garde un fetch trades compact en mode live 1h", () => {
    expect(getChartTradesFetchLimit(false)).toBe(300);
  });

  it("conserve le fetch large quand l utilisateur charge tout le run", () => {
    expect(getChartTradesFetchLimit(true)).toBe(2000);
  });
});

describe("getChartRightOffsetBars", () => {
  it("garde une marge droite genereuse sur les timeframes rapides", () => {
    expect(getChartRightOffsetBars(5)).toBe(10);
  });

  it("retrecit la marge sur les timeframes plus lents sans la supprimer", () => {
    expect(getChartRightOffsetBars(300)).toBe(6);
  });

  it("s agrandit quand le dernier trade depasse legerement la derniere bougie du chart", () => {
    // gap = 50s = 10 bars 5s, sous le cap CHART_RIGHT_OFFSET_HARD_CAP_BARS (30)
    // base(10) + gapBars(10) + 2 = 22
    expect(getChartRightOffsetBars(5, 10_050, 10_000)).toBe(22);
  });

  it("retombe sur le base offset quand l ecart trade vs chart est aberrant", () => {
    // gap = 300s = 60 bars 5s, au-dessus du cap (30) -> on ignore la
    // contribution gapBars pour ne pas creer un mur invisible (DW bug):
    // padder le right edge de centaines de bars vides ecrase les bougies
    // a gauche et empeche toute navigation horizontale.
    expect(getChartRightOffsetBars(5, 10_300, 10_000)).toBe(10);
  });
});

describe("getLatestTradeTimeSec", () => {
  it("retient le timestamp le plus recent parmi entry, exit et scale-out", () => {
    expect(
      getLatestTradeTimeSec([
        {
          entry_time: "2026-03-25T09:30:00.000Z",
          exit_time: "2026-03-25T09:34:00.000Z",
          scale_out_ts: null,
        },
        {
          entry_time: "2026-03-25T10:00:00.000Z",
          exit_time: null,
          scale_out_ts: "2026-03-25T10:01:30.000Z",
        },
      ] as any[])
    ).toBe(Math.floor(Date.parse("2026-03-25T10:01:30.000Z") / 1000));
  });
});

describe("snapTimestampToLoadedBarTime", () => {
  const bars = [
    { timestamp: "2026-03-25T09:30:00.000Z" },
    { timestamp: "2026-03-25T09:30:05.000Z" },
    { timestamp: "2026-03-25T09:30:10.000Z" },
  ] as any[];

  it("snappe un trade proche sur la bougie chargee la plus proche", () => {
    expect(
      snapTimestampToLoadedBarTime(
        "2026-03-25T09:30:06.000Z",
        bars,
        5,
        false
      )
    ).toBe(Math.floor(Date.parse("2026-03-25T09:30:05.000Z") / 1000));
  });

  it("refuse un timestamp hors couverture quand le fallback bucket est interdit", () => {
    expect(
      snapTimestampToLoadedBarTime(
        "2026-03-25T09:31:30.000Z",
        bars,
        5,
        false
      )
    ).toBeNull();
  });
});

describe("getViewportEndCandidateMs", () => {
  it("retient le dernier trade si plus recent que la derniere bougie", () => {
    expect(getViewportEndCandidateMs(10_000, 11, 9_000)).toBe(11_000);
  });

  it("retombe sur now quand il n y a ni bougie ni trade", () => {
    expect(getViewportEndCandidateMs(null, null, 12_345)).toBe(12_345);
  });
});

describe("mergeOhlcBars", () => {
  it("fusionne snapshot et backfill sans doublons et garde l ordre chronologique", () => {
    const merged = mergeOhlcBars(
      [
        { timestamp: "2026-03-25T09:30:05.000Z", open: 1.09, high: 1.11, low: 1.08, close: 1.1 },
        { timestamp: "2026-03-25T09:30:10.000Z", open: 1.11, high: 1.21, low: 1.1, close: 1.2 },
      ] as any[],
      [
        { timestamp: "2026-03-25T09:30:00.000Z", open: 0.99, high: 1.01, low: 0.98, close: 1.0 },
        { timestamp: "2026-03-25T09:30:05.000Z", open: 9.8, high: 10, low: 9.7, close: 9.9 },
      ] as any[]
    );

    expect(merged.map((bar) => [bar.timestamp, bar.close])).toEqual([
      ["2026-03-25T09:30:00.000Z", 1.0],
      ["2026-03-25T09:30:05.000Z", 1.1],
      ["2026-03-25T09:30:10.000Z", 1.2],
    ]);
  });
});

describe("resolveMinChartTimeframeSeconds", () => {
  it("utilise la resolution source quand elle est connue", () => {
    expect(
      resolveMinChartTimeframeSeconds({
        source_bar_interval_s: 15,
      } as any)
    ).toBe(15);
  });

  it("retombe sur 5s quand le meta ne renseigne rien", () => {
    expect(resolveMinChartTimeframeSeconds(null)).toBe(5);
  });
});

describe("getSupportedChartTimeframes", () => {
  it("desactive les timeframes plus fins que la source", () => {
    const options = getSupportedChartTimeframes(TIMEFRAMES, 5);
    expect(options.find((tf) => tf.label === "1s")?.disabled).toBe(true);
    expect(options.find((tf) => tf.label === "5s")?.disabled).toBe(false);
    expect(options.find((tf) => tf.label === "15s")?.disabled).toBe(false);
  });
});

describe("isAbortLikeChartError", () => {
  it("reconnait les AbortError navigateur", () => {
    const error = Object.assign(new Error("The operation was aborted"), {
      name: "AbortError",
    });

    expect(isAbortLikeChartError(error)).toBe(true);
  });

  it("reconnait le message signal is aborted without reason", () => {
    expect(
      isAbortLikeChartError(new Error("signal is aborted without reason"))
    ).toBe(true);
  });

  it("laisse passer les vraies erreurs de chargement", () => {
    expect(isAbortLikeChartError(new Error("HTTP 503"))).toBe(false);
  });
});

describe("selectClosedTradePathTrades", () => {
  it("ne garde que les trades fermes proches du viewport", () => {
    const from = Math.floor(
      Date.parse("2026-03-25T09:30:00.000Z") / 1000
    );
    const to = Math.floor(
      Date.parse("2026-03-25T09:35:00.000Z") / 1000
    );
    const trades = [
      {
        canonical_id: "t-1",
        entry_time: "2026-03-25T08:00:00.000Z",
        exit_time: "2026-03-25T08:05:00.000Z",
      },
      {
        canonical_id: "t-2",
        entry_time: "2026-03-25T09:25:00.000Z",
        exit_time: "2026-03-25T09:35:00.000Z",
      },
      {
        canonical_id: "t-3",
        entry_time: "2026-03-25T11:10:00.000Z",
        exit_time: "2026-03-25T11:15:00.000Z",
      },
    ] as any[];

    const selected = selectClosedTradePathTrades(trades, {
      from,
      to,
    });

    expect(selected.map((trade) => trade.canonical_id)).toEqual(["t-2"]);
  });
});

describe("selectTradesForPanel", () => {
  it("epingle les trades ouverts puis les trades de la fenetre visible", () => {
    const visibleRange = {
      from: Math.floor(Date.parse("2026-03-25T09:30:00.000Z") / 1000),
      to: Math.floor(Date.parse("2026-03-25T09:35:00.000Z") / 1000),
    };
    const trades = [
      {
        canonical_id: "open-1",
        isOpen: true,
        entry_time: "2026-03-25T11:00:00.000Z",
      },
      {
        canonical_id: "closed-visible",
        isOpen: false,
        entry_time: "2026-03-25T09:25:00.000Z",
        exit_time: "2026-03-25T09:32:00.000Z",
      },
      {
        canonical_id: "closed-old",
        isOpen: false,
        entry_time: "2026-03-25T08:00:00.000Z",
        exit_time: "2026-03-25T08:05:00.000Z",
      },
    ] as any[];

    const selected = selectTradesForPanel(trades, visibleRange);

    expect(selected.map((trade) => trade.canonical_id)).toEqual([
      "open-1",
      "closed-visible",
    ]);
  });

  it("retombe sur les derniers trades fermes si la fenetre est vide", () => {
    const visibleRange = {
      from: Math.floor(Date.parse("2026-03-25T12:00:00.000Z") / 1000),
      to: Math.floor(Date.parse("2026-03-25T12:05:00.000Z") / 1000),
    };
    const trades = [
      {
        canonical_id: "closed-older",
        isOpen: false,
        entry_time: "2026-03-25T08:00:00.000Z",
        exit_time: "2026-03-25T08:05:00.000Z",
      },
      {
        canonical_id: "closed-newer",
        isOpen: false,
        entry_time: "2026-03-25T09:00:00.000Z",
        exit_time: "2026-03-25T09:10:00.000Z",
      },
    ] as any[];

    const selected = selectTradesForPanel(trades, visibleRange);

    expect(selected.map((trade) => trade.canonical_id)).toEqual([
      "closed-newer",
      "closed-older",
    ]);
  });
});

describe("summarizeTradesForViewport", () => {
  it("aggrege open, wins, losses et extremes utiles pour la lecture du graphe", () => {
    const summary = summarizeTradesForViewport([
      {
        canonical_id: "open-1",
        isOpen: true,
        unrealized_pips: 1.5,
      },
      {
        canonical_id: "closed-win",
        isOpen: false,
        pnl_usd_display: 12.4,
        net_pips_display: 4.2,
      },
      {
        canonical_id: "closed-loss",
        isOpen: false,
        pnl_usd_display: -3.1,
        net_pips_display: -1.3,
      },
    ] as any[]);

    expect(summary).toEqual({
      total: 3,
      openCount: 1,
      closedCount: 2,
      wins: 1,
      losses: 1,
      netUsd: 9.3,
      netPips: 4.4,
      bestPips: 4.2,
      worstPips: -1.3,
    });
  });
});
