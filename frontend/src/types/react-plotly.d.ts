declare module "react-plotly.js" {
    import { Component } from "react";
    import Plotly from "plotly.js";

    interface PlotParams {
        data: Plotly.Data[];
        layout?: Partial<Plotly.Layout>;
        config?: Partial<Plotly.Config>;
        frames?: Plotly.Frame[];
        style?: React.CSSProperties;
        className?: string;
        useResizeHandler?: boolean;
        revision?: number;
        onInitialized?: (figure: Readonly<{ data: Plotly.Data[]; layout: Partial<Plotly.Layout> }>, graphDiv: HTMLElement) => void;
        onUpdate?: (figure: Readonly<{ data: Plotly.Data[]; layout: Partial<Plotly.Layout> }>, graphDiv: HTMLElement) => void;
        onPurge?: (figure: Readonly<{ data: Plotly.Data[]; layout: Partial<Plotly.Layout> }>, graphDiv: HTMLElement) => void;
        onError?: (err: Error) => void;
        onClick?: (event: Plotly.PlotMouseEvent) => void;
        onHover?: (event: Plotly.PlotMouseEvent) => void;
        onUnhover?: (event: Plotly.PlotMouseEvent) => void;
        onSelected?: (event: Plotly.PlotSelectionEvent) => void;
        onRelayout?: (event: Plotly.PlotRelayoutEvent) => void;
    }

    class Plot extends Component<PlotParams> { }
    export default Plot;
}
