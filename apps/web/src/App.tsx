import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useMatch
} from "react-router-dom";
import { GitBranch, History, LayoutDashboard, LogOut, Menu, X } from "lucide-react";

import { useAuth } from "./auth/AuthContext";
import { DashboardPage } from "./pages/DashboardPage";
import { HistoryPage } from "./pages/HistoryPage";
import { LoginPage } from "./pages/LoginPage";
import { ScenarioDetailPage } from "./pages/ScenarioDetailPage";
import { SessionResultPage } from "./pages/SessionResultPage";
import { SessionWorkspacePage } from "./pages/SessionWorkspacePage";

function userInitial(displayName: string): string {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) {
    return "GA";
  }

  const [first = "G", second = "A"] = trimmed.split(/\s+/).map((token) => token[0]?.toUpperCase());
  return `${first ?? "G"}${second ?? "A"}`;
}

function navClassName({ isActive }: { isActive: boolean }): string {
  return `sidebar-link${isActive ? " active" : ""}`;
}

export default function App() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isWorkspaceRoute = Boolean(useMatch({ path: "/sessions/:id", end: true }));

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  if (loading) {
    return (
      <div className="app-shell">
        <main className="app-main app-main-centered">
          <section className="auth-layout page" aria-busy="true" aria-live="polite">
            <div className="panel state-surface">
              <p className="state-text">Loading user session...</p>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-shell">
        <main className="app-main app-main-centered">
          <LoginPage />
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell app-shell-auth">
      <header className="mobile-topbar">
        <Link className="mobile-brand" to="/dashboard">
          <GitBranch aria-hidden="true" className="inline-icon" size={16} />
          git-arena
        </Link>
        <button
          aria-expanded={mobileNavOpen}
          aria-label="Toggle navigation menu"
          className="button button-secondary button-mini"
          onClick={() => {
            setMobileNavOpen((open) => !open);
          }}
          type="button"
        >
          {mobileNavOpen ? (
            <>
              <X aria-hidden="true" className="inline-icon" size={14} />
              Close
            </>
          ) : (
            <>
              <Menu aria-hidden="true" className="inline-icon" size={14} />
              Menu
            </>
          )}
        </button>
      </header>

      {mobileNavOpen && (
        <nav aria-label="Mobile" className="mobile-nav">
          <NavLink className={navClassName} to="/dashboard">
            <span className="sidebar-link-label">
              <LayoutDashboard aria-hidden="true" className="inline-icon" size={16} />
              Dashboard
            </span>
          </NavLink>
          <NavLink className={navClassName} to="/history">
            <span className="sidebar-link-label">
              <History aria-hidden="true" className="inline-icon" size={16} />
              History
            </span>
          </NavLink>
          <div className="mobile-user-row sidebar-user">
            {user.avatarUrl ? (
              <img alt="" className="sidebar-avatar" src={user.avatarUrl} />
            ) : (
              <span className="sidebar-avatar-fallback" aria-hidden="true">
                {userInitial(user.displayName)}
              </span>
            )}
            <div className="sidebar-user-meta">
              <p className="sidebar-user-name">{user.displayName}</p>
              <p className="sidebar-user-email">{user.email}</p>
            </div>
          </div>
          <button className="button button-secondary" onClick={() => void logout()} type="button">
            <LogOut aria-hidden="true" className="inline-icon" size={15} />
            Logout
          </button>
        </nav>
      )}

      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <Link className="sidebar-brand-link" to="/dashboard">
            <GitBranch aria-hidden="true" className="inline-icon" size={16} />
            git-arena
          </Link>
          <span className="sidebar-brand-note">Git Practice Platform</span>
        </div>

        <nav aria-label="Primary" className="sidebar-nav">
          <NavLink className={navClassName} to="/dashboard">
            <span className="sidebar-link-label">
              <LayoutDashboard aria-hidden="true" className="inline-icon" size={16} />
              Dashboard
            </span>
          </NavLink>
          <NavLink className={navClassName} to="/history">
            <span className="sidebar-link-label">
              <History aria-hidden="true" className="inline-icon" size={16} />
              History
            </span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            {user.avatarUrl ? (
              <img alt="" className="sidebar-avatar" src={user.avatarUrl} />
            ) : (
              <span className="sidebar-avatar-fallback" aria-hidden="true">
                {userInitial(user.displayName)}
              </span>
            )}
            <div className="sidebar-user-meta">
              <p className="sidebar-user-name">{user.displayName}</p>
              <p className="sidebar-user-email">{user.email}</p>
            </div>
          </div>
          <button className="button button-secondary" onClick={() => void logout()} type="button">
            <LogOut aria-hidden="true" className="inline-icon" size={15} />
            Logout
          </button>
        </div>
      </aside>

      <main className={`app-main${isWorkspaceRoute ? " app-main-workspace" : ""}`}>
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
