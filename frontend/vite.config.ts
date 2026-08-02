import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const crossOriginIsolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    modulePreload: {
      polyfill: false,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    headers: crossOriginIsolationHeaders,
    fs: {
      allow: [path.resolve(__dirname), path.resolve(__dirname, "..")],
    },
  },
  preview: {
    headers: crossOriginIsolationHeaders,
  },
});
