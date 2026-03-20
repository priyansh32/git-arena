import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const ROOT_ENV_DIR = resolve(fileURLToPath(new URL("../..", import.meta.url)));

export default defineConfig({
  envDir: ROOT_ENV_DIR,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true
      },
      "/ws": {
        target: "http://localhost:3001",
        changeOrigin: true,
        ws: true
      }
    }
  }
});
