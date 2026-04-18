import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const BUILD_STAMP = new Date().toISOString();

export default defineConfig({
  base: "/",
  plugins: [react()],
  define: {
    "import.meta.env.VITE_BUILD_STAMP": JSON.stringify(BUILD_STAMP),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8015",
    },
  },
  build: {
    target: "es2020",
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
        },
      },
    },
  },
});
