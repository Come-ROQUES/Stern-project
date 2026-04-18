import { describe, expect, it } from "vitest";

import {
    normalizeSession,
    normalizeSpreadRegime,
    normalizeVolRegime,
} from "./regimeTaxonomy";

describe("regimeTaxonomy", () => {
    it("normalizes MEDIUM into NORMAL", () => {
        expect(normalizeVolRegime("MEDIUM")).toBe("NORMAL");
        expect(normalizeSpreadRegime("medium")).toBe("NORMAL");
    });

    it("normalizes session casing and aliases", () => {
        expect(normalizeSession("Asia")).toBe("ASIA");
        expect(normalizeSession("early_asia")).toBe("ASIA");
        expect(normalizeSession("Overlap")).toBe("OVERLAP");
    });
});
