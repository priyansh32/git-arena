import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";

import { AuthProvider } from "./auth/AuthContext";
import App from "./App";
import "./index.css";
import "@xterm/xterm/css/xterm.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element '#root' was not found.");
}

const PRERENDERED_ROUTES = new Set(["/", "/privacy", "/terms"]);

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

const app = (
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);

const currentPath = normalizePathname(window.location.pathname);
const shouldHydrate = rootElement.hasChildNodes() && PRERENDERED_ROUTES.has(currentPath);

if (shouldHydrate) {
  hydrateRoot(rootElement, app);
} else {
  createRoot(rootElement).render(app);
}
