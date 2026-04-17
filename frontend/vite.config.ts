import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const BUILD_STAMP = new Date().toISOString();

function basicAuthUseCredentials(): Plugin {
  return {
    name: "stern-basic-auth-use-credentials",
    apply: "build",
    transformIndexHtml(html) {
      return html.replaceAll(
        /\scrossorigin(\s*>|\s+href=|\s+src=)/g,
        ' crossorigin="use-credentials"$1',
      );
    },
    generateBundle(_options, bundle) {
      for (const out of Object.values(bundle)) {
        if (out.type !== "chunk") {
          continue;
        }
        out.code = out.code.replaceAll(
          'm.crossOrigin=""',
          'm.crossOrigin="use-credentials"',
        );
      }
    },
  };
}

export default defineConfig({
  // Serve the built assets under /react/ when hosted behind nginx.
  base: "/",
  plugins: [basicAuthUseCredentials(), react()],
  define: {
    "import.meta.env.VITE_BUILD_STAMP": JSON.stringify(BUILD_STAMP),
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Heavy charting libs - split into separate cacheable chunks
          "vendor-lightweight-charts": ["lightweight-charts"],
          "vendor-framer": ["framer-motion"],
          // React core - stable across deploys
          "vendor-react": ["react", "react-dom"],
        },
      },
    },
    // Increase chunk size warning to avoid noise
    chunkSizeWarningLimit: 600,
  },
});
