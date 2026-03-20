import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const ROOT_ENV_DIR = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const API_PORT = Number(process.env.API_PORT ?? "3001");
const WEB_PORT = Number(process.env.WEB_PORT ?? "5173");
const API_PROXY_HOST = process.env.VITE_API_PROXY_HOST ?? "localhost";
const API_PROXY_TARGET =
  process.env.VITE_API_PROXY_TARGET ?? `http://${API_PROXY_HOST}:${API_PORT}`;

export default defineConfig({
  envDir: ROOT_ENV_DIR,
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: WEB_PORT,
    strictPort: true,
    proxy: {
      "/api": {
        target: API_PROXY_TARGET,
        changeOrigin: true
      },
      "/ws": {
        target: API_PROXY_TARGET,
        changeOrigin: true,
        ws: true
      }
    }
  }
});
