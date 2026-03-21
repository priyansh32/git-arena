import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";

import { AuthProvider } from "./auth/AuthContext";
import App from "./App";
import "./index.css";
import "@xterm/xterm/css/xterm.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element '#root' was not found.");
}

const app = (
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);

if (rootElement.hasChildNodes()) {
  hydrateRoot(rootElement, app);
} else {
  createRoot(rootElement).render(app);
}
