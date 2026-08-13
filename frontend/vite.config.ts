import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The production build lands inside the backend package so a single Cloud Run
// container serves both the API and the UI.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
    css: true,
    clearMocks: true,
  },
  build: {
    outDir: "../backend/app/static",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
