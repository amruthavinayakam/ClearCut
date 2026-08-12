import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The production build lands inside the backend package so a single Cloud Run
// container serves both the API and the UI.
export default defineConfig({
  plugins: [react()],
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
