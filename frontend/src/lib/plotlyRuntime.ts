declare global {
  interface Window {
    Plotly?: any;
  }
}

const PLOTLY_SRC = "https://cdn.plot.ly/plotly-basic-2.33.0.min.js";
let loadingPromise: Promise<any> | null = null;

export async function loadPlotlyRuntime(): Promise<any> {
  if (typeof window === "undefined") {
    throw new Error("Plotly runtime is only available in the browser");
  }
  if (window.Plotly) return window.Plotly;
  if (!loadingPromise) {
    loadingPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = PLOTLY_SRC;
      script.async = true;
      script.onload = () => resolve(window.Plotly);
      script.onerror = (event) => reject(event);
      document.body.appendChild(script);
    });
  }
  return loadingPromise;
}
