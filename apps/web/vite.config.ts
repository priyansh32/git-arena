import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const ROOT_ENV_DIR = resolve(fileURLToPath(new URL("../..", import.meta.url)));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ROOT_ENV_DIR, "");
  const apiPort = Number(env.API_PORT ?? process.env.API_PORT ?? "3001");
  const webPort = Number(env.WEB_PORT ?? process.env.WEB_PORT ?? "5173");
  const apiProxyHost = env.VITE_API_PROXY_HOST ?? process.env.VITE_API_PROXY_HOST ?? "localhost";
  const apiProxyTarget =
    env.VITE_API_PROXY_TARGET ??
    process.env.VITE_API_PROXY_TARGET ??
    `http://${apiProxyHost}:${apiPort}`;
  const allowedHosts = (env.VITE_ALLOWED_HOSTS ?? process.env.VITE_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter((host) => host.length > 0);
  const proxyConfig = {
    "/api": {
      target: apiProxyTarget,
      changeOrigin: true
    },
    "/ws": {
      target: apiProxyTarget,
      changeOrigin: true,
      ws: true
    }
  };

  return {
    envDir: ROOT_ENV_DIR,
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: webPort,
      strictPort: true,
      proxy: proxyConfig,
      allowedHosts: allowedHosts.length > 0 ? allowedHosts : undefined
    },
    preview: {
      host: "0.0.0.0",
      port: webPort,
      strictPort: true,
      proxy: proxyConfig,
      allowedHosts: allowedHosts.length > 0 ? allowedHosts : undefined
    }
  };
});
