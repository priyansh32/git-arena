import { Link, Navigate, Route, Routes } from "react-router-dom";

import { DashboardPage } from "./pages/DashboardPage";
import { ScenarioDetailPage } from "./pages/ScenarioDetailPage";
import { SessionWorkspacePage } from "./pages/SessionWorkspacePage";

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="brand" to="/dashboard">
          GitArena
        </Link>
        <nav>
          <Link className="nav-link" to="/dashboard">
            Dashboard
          </Link>
        </nav>
      </header>

      <main className="app-main">
        <Routes>
          <Route element={<Navigate replace to="/dashboard" />} path="/" />
          <Route element={<DashboardPage />} path="/dashboard" />
          <Route element={<ScenarioDetailPage />} path="/scenarios/:id" />
          <Route element={<SessionWorkspacePage />} path="/sessions/:id" />
          <Route element={<Navigate replace to="/dashboard" />} path="*" />
        </Routes>
      </main>
    </div>
  );
}
