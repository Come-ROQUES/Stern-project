declare global {
  interface Window {
    ApexCharts?: any;
  }
}

const APEXCHARTS_SRC =
  "https://cdn.jsdelivr.net/npm/apexcharts@4.4.0/dist/apexcharts.min.js";

let loadingPromise: Promise<any> | null = null;

export async function loadApexChartsRuntime(): Promise<any> {
  if (typeof window === "undefined") {
    throw new Error("ApexCharts runtime is only available in the browser");
  }
  if (window.ApexCharts) return window.ApexCharts;
  if (!loadingPromise) {
    loadingPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = APEXCHARTS_SRC;
      script.async = true;
      script.onload = () => resolve(window.ApexCharts);
      script.onerror = (event) => reject(event);
      document.body.appendChild(script);
    });
  }
  return loadingPromise;
}
