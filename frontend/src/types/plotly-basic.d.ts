declare module "plotly.js-basic-dist" {
    import Plotly from "plotly.js";
    export = Plotly;
}

declare module "react-plotly.js/factory" {
    import { Component } from "react";

    interface PlotParams {
        data: any[];
        layout?: Record<string, any>;
        config?: Record<string, any>;
        frames?: any[];
        style?: React.CSSProperties;
        className?: string;
        useResizeHandler?: boolean;
        revision?: number;
        onInitialized?: (figure: any, graphDiv: HTMLElement) => void;
        onUpdate?: (figure: any, graphDiv: HTMLElement) => void;
        onPurge?: (figure: any, graphDiv: HTMLElement) => void;
        onError?: (err: Error) => void;
        onClick?: (event: any) => void;
        onHover?: (event: any) => void;
        onUnhover?: (event: any) => void;
        onSelected?: (event: any) => void;
        onRelayout?: (event: any) => void;
        onReady?: (el: HTMLElement, plotly: any) => void;
    }

    function createPlotlyComponent(plotly: any): new () => Component<PlotParams>;
    export default createPlotlyComponent;
}
