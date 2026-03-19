import { Link, Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "./auth/AuthContext";
import { DashboardPage } from "./pages/DashboardPage";
import { HistoryPage } from "./pages/HistoryPage";
import { LoginPage } from "./pages/LoginPage";
import { ScenarioDetailPage } from "./pages/ScenarioDetailPage";
import { SessionResultPage } from "./pages/SessionResultPage";
import { SessionWorkspacePage } from "./pages/SessionWorkspacePage";

export default function App() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <p className="state-text">Loading user session...</p>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <LoginPage />
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="brand" to="/dashboard">
          GitArena
        </Link>
        <nav className="header-nav">
          <Link className="nav-link" to="/dashboard">
            Dashboard
          </Link>
          <Link className="nav-link" to="/history">
            History
          </Link>
          <span className="nav-user">{user.displayName}</span>
          <button className="button subtle" onClick={() => void logout()} type="button">
            Logout
          </button>
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
