import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StorageMap = Record<string, string>;

function createStorageMock() {
  const store: StorageMap = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach((key) => delete store[key]);
    }),
  };
}

describe("useBundleRuns state", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("localStorage", createStorageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("initialise le bundle en mode active avec 3 run ids vides", async () => {
    const { getBundleState, resetBundleStateForTests } = await import(
      "./useBundleRuns"
    );
    resetBundleStateForTests();
    const state = getBundleState();

    expect(state.enabled).toBe(true);
    expect(state.dwRunId).toBeNull();
    expect(state.s2RunId).toBeNull();
    expect(state.tfRunId).toBeNull();
  });

  it("enforce les invariants de run_id distincts DW/S2/S3", async () => {
    const {
      getBundleState,
      syncBundleDwRunId,
      syncBundleS2RunId,
      syncBundleTfRunId,
      resetBundleStateForTests,
    } = await import("./useBundleRuns");
    resetBundleStateForTests();

    syncBundleDwRunId("run_a");
    syncBundleS2RunId("run_a");
    expect(getBundleState().s2RunId).toBeNull();

    syncBundleS2RunId("run_b");
    syncBundleTfRunId("run_b");
    expect(getBundleState().tfRunId).toBeNull();

    syncBundleTfRunId("run_a");
    expect(getBundleState().tfRunId).toBeNull();
  });

  it("persiste et recharge tfRunId depuis localStorage", async () => {
    const {
      getBundleState,
      syncBundleDwRunId,
      syncBundleS2RunId,
      syncBundleTfRunId,
      resetBundleStateForTests,
    } = await import("./useBundleRuns");
    resetBundleStateForTests();

    syncBundleDwRunId("dw_1");
    syncBundleS2RunId("s2_1");
    syncBundleTfRunId("tf_1");
    resetBundleStateForTests();

    const state = getBundleState();
    expect(state.dwRunId).toBe("dw_1");
    expect(state.s2RunId).toBe("s2_1");
    expect(state.tfRunId).toBe("tf_1");
  });

  it("ignore les updates bundle idempotents", async () => {
    const { syncBundleDwRunId, resetBundleStateForTests } = await import(
      "./useBundleRuns"
    );
    resetBundleStateForTests();

    syncBundleDwRunId("dw_1");
    const writesAfterFirstUpdate =
      (localStorage.setItem as unknown as { mock: { calls: unknown[] } }).mock
        .calls.length +
      (localStorage.removeItem as unknown as { mock: { calls: unknown[] } }).mock
        .calls.length;

    syncBundleDwRunId("dw_1");
    const writesAfterSecondUpdate =
      (localStorage.setItem as unknown as { mock: { calls: unknown[] } }).mock
        .calls.length +
      (localStorage.removeItem as unknown as { mock: { calls: unknown[] } }).mock
        .calls.length;

    expect(writesAfterSecondUpdate).toBe(writesAfterFirstUpdate);
  });

  it("resynchronise S2 vers le run actif si la selection courante etait auto-sync", async () => {
    const {
      autoSyncBundleS2RunId,
      getBundleState,
      resetBundleStateForTests,
    } = await import("./useBundleRuns");
    resetBundleStateForTests();

    autoSyncBundleS2RunId("run-old");
    autoSyncBundleS2RunId("run-new");

    expect(getBundleState().s2RunId).toBe("run-new");
  });

  it("preserve un override manuel S2 quand le run actif change", async () => {
    const {
      autoSyncBundleS2RunId,
      getBundleState,
      resetBundleStateForTests,
      syncBundleS2RunId,
    } = await import("./useBundleRuns");
    resetBundleStateForTests();

    autoSyncBundleS2RunId("run-old");
    syncBundleS2RunId("run-manual");
    autoSyncBundleS2RunId("run-new");

    expect(getBundleState().s2RunId).toBe("run-manual");
  });

  it("resynchronise S3 vers le run actif si la selection courante etait auto-sync", async () => {
    const {
      autoSyncBundleTfRunId,
      getBundleState,
      resetBundleStateForTests,
    } = await import("./useBundleRuns");
    resetBundleStateForTests();

    autoSyncBundleTfRunId("tf-old");
    autoSyncBundleTfRunId("tf-new");

    expect(getBundleState().tfRunId).toBe("tf-new");
  });

  it("preserve un override manuel S3 quand le run actif change", async () => {
    const {
      autoSyncBundleTfRunId,
      getBundleState,
      resetBundleStateForTests,
      syncBundleTfRunId,
    } = await import("./useBundleRuns");
    resetBundleStateForTests();

    autoSyncBundleTfRunId("tf-old");
    syncBundleTfRunId("tf-manual");
    autoSyncBundleTfRunId("tf-new");

    expect(getBundleState().tfRunId).toBe("tf-manual");
  });
});
