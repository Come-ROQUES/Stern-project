import React from "react";
import { type ApexOptions } from "apexcharts";
import { type EquityCurvePoint } from "../lib/api";
import { ApexChart } from "../lib/ApexChart";

type EquityCurveChartProps = {
    equityCurve: EquityCurvePoint[];
    startingEquity: number;
    height?: number | string;
};

const palette = {
    accent: "#00FF88",
    gray: "#8a918a",
};

function formatUsd(value: number): string {
    return `${value.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    })}`;
}

export function EquityCurveChart({
    equityCurve,
    startingEquity,
    height = 250,
}: EquityCurveChartProps) {
    // Trade-indexed: each point is evenly spaced (1 point = 1 trade exit).
    // Labels show short date; full timestamp in tooltip.
    const labels = equityCurve.map((p) => {
        const d = new Date(p.timestamp);
        return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    });

    const series = [
        {
            name: "Equity",
            data: equityCurve.map((p) => p.equity),
        },
    ];

    const options: ApexOptions = {
        chart: {
            type: "area",
            height: height,
            background: "transparent",
            toolbar: { show: false },
            animations: { enabled: false },
        },
        theme: { mode: "dark" },
        colors: [palette.accent],
        dataLabels: { enabled: false },
        stroke: {
            curve: "straight",
            width: 2,
        },
        markers: {
            size: 3,
            strokeWidth: 0,
            hover: { size: 5 },
        },
        fill: {
            type: "gradient",
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.4,
                opacityTo: 0.1,
                stops: [0, 90, 100],
            },
        },
        grid: {
            borderColor: "rgba(255,255,255,0.08)",
            strokeDashArray: 4,
        },
        xaxis: {
            type: "category",
            categories: labels,
            labels: {
                rotate: -45,
                rotateAlways: false,
                hideOverlappingLabels: true,
                style: {
                    colors: palette.gray,
                    fontSize: "10px",
                },
            },
            axisTicks: { show: false },
            title: {
                text: "Trade #",
                style: { color: palette.gray, fontSize: "10px" },
            },
        },
        yaxis: {
            labels: {
                style: {
                    colors: palette.gray,
                    fontSize: "11px",
                },
                formatter: (val) => `$${(val / 1000).toFixed(1)}K`,
            },
        },
        tooltip: {
            custom: ({ dataPointIndex }) => {
                const pt = equityCurve[dataPointIndex];
                if (!pt) return "";
                const d = new Date(pt.timestamp);
                const ts = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
                const pnlSign = pt.pnl >= 0 ? "+" : "";
                return `<div style="padding:6px 10px;font-size:12px;background:#0A0E18;border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:#e5e7eb;">
                    <div style="font-weight:600;margin-bottom:2px;">Trade #${dataPointIndex + 1}</div>
                    <div>${ts} UTC</div>
                    <div>Equity: ${formatUsd(pt.equity)}</div>
                    <div>PnL: ${pnlSign}${pt.pnl.toFixed(2)} USD</div>
                </div>`;
            },
        },
        annotations: {
            yaxis: [
                {
                    y: startingEquity,
                    borderColor: "rgba(255, 170, 0, 0.5)",
                    strokeDashArray: 2,
                    label: {
                        borderColor: "rgba(255, 170, 0, 0.5)",
                        style: {
                            color: "#000",
                            background: "rgba(255, 170, 0, 0.8)",
                            fontSize: "10px",
                            padding: { left: 5, right: 5, top: 2, bottom: 2 },
                        },
                        text: "Start",
                    },
                },
            ],
        },
    };

    return (
        <div className="h-full w-full">
            <ApexChart
                options={options}
                series={series}
                type="area"
                height={height}
            />
        </div>
    );
}
