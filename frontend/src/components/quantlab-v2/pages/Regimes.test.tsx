import { describe, expect, it } from "vitest";

import { buildHeatmapPlotModel } from "./Regimes";
import { RegimesDashboardHeatmap } from "../../../lib/quantApi";

function makeHeatmap(
    overrides: Partial<RegimesDashboardHeatmap> = {}
): RegimesDashboardHeatmap {
    return {
        metric: "mean_pnl_net_pips",
        x_labels: ["LOW", "NORMAL"],
        y_labels: ["ASIA", "LONDON"],
        matrix: [
            [0.5, null],
            [null, -0.2],
        ],
        secondary_metric: "p05_pips",
        secondary_matrix: [
            [-0.8, null],
            [null, -0.6],
        ],
        counts: [
            [12, 0],
            [0, 7],
        ],
        confidence: [
            ["HIGH", "LOW"],
            ["LOW", "MEDIUM"],
        ],
        confidence_scores: [
            [0.82, 0],
            [0, 0.54],
        ],
        image_base64: "legacy_png_ignored",
        ...overrides,
    };
}

describe("Regimes heatmap interactive model", () => {
    it("builds an interactive Plotly heatmap when matrix has data", () => {
        const plot = buildHeatmapPlotModel(makeHeatmap());
        expect(plot).not.toBeNull();
        expect(plot?.data[0]?.type).toBe("heatmap");
        expect(plot?.data[0]?.colorscale).toEqual([
            [0, "#000004"],
            [0.25, "#3b0f70"],
            [0.5, "#8c2981"],
            [0.75, "#de4968"],
            [1, "#fcfdbf"],
        ]);
        expect(plot?.data[0]?.z).toEqual([
            [0.5, null],
            [null, -0.2],
        ]);
        expect(String(plot?.data[0]?.hovertemplate)).toContain("p05_pips");
    });

    it("returns null when matrix has no exploitable cell", () => {
        const plot = buildHeatmapPlotModel(
            makeHeatmap({
                matrix: [
                    [null, null],
                    [null, null],
                ],
            })
        );
        expect(plot).toBeNull();
    });

    it("keeps secondary metric/count/confidence in customdata", () => {
        const plot = buildHeatmapPlotModel(makeHeatmap());
        expect(plot?.data[0]?.customdata).toEqual([
            [[-0.8, 12, "HIGH", 0.82], [null, 0, "LOW", 0]],
            [[null, 0, "LOW", 0], [-0.6, 7, "MEDIUM", 0.54]],
        ]);
    });
});
