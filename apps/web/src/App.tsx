import { Link, Navigate, Route, Routes } from "react-router-dom";

import { DashboardPage } from "./pages/DashboardPage";
import { HistoryPage } from "./pages/HistoryPage";
import { ScenarioDetailPage } from "./pages/ScenarioDetailPage";
import { SessionResultPage } from "./pages/SessionResultPage";
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
          <Link className="nav-link" to="/history">
            History
          </Link>
        </nav>
      </header>

      <main className="app-main">
        <Routes>
          <Route element={<Navigate replace to="/dashboard" />} path="/" />
          <Route element={<DashboardPage />} path="/dashboard" />
          <Route element={<HistoryPage />} path="/history" />
          <Route element={<ScenarioDetailPage />} path="/scenarios/:id" />
          <Route element={<SessionWorkspacePage />} path="/sessions/:id" />
          <Route element={<SessionResultPage />} path="/sessions/:id/result" />
          <Route element={<Navigate replace to="/dashboard" />} path="*" />
        </Routes>
      </main>
    </div>
  );
}
