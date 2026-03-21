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
  return `flex items-center gap-2 px-4 py-2 rounded-lg text-text-secondary transition-colors relative hover:bg-bg-surface-hover hover:text-text-primary ${
    isActive ? "bg-accent-primary/10 text-[#7fe5f7]" : ""
  }`;
}

export default function App() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isWorkspaceRoute = Boolean(useMatch({ path: "/sessions/:id", end: true }));

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const appRoutes = (
    <Routes>
      <Route element={<Navigate replace to="/dashboard" />} path="/" />
      <Route element={<DashboardPage />} path="/dashboard" />
      <Route element={<HistoryPage />} path="/history" />
      <Route element={<ScenarioDetailPage />} path="/scenarios/:id" />
      <Route element={<SessionWorkspacePage />} path="/sessions/:id" />
      <Route element={<SessionResultPage />} path="/sessions/:id/result" />
      <Route element={<Navigate replace to="/dashboard" />} path="*" />
    </Routes>
  );

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <main className="flex-1 flex items-center justify-center p-6 min-h-[calc(100vh-56px)] lg:min-h-screen">
          <section className="w-full max-w-[440px] mx-auto flex flex-col gap-6" aria-busy="true" aria-live="polite">
            <div className="bg-bg-surface border border-border-subtle rounded-xl flex items-center justify-center min-h-[120px] p-8 text-center">
              <p className="m-0 text-text-secondary">Loading user session...</p>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col min-h-screen">
        <main className="flex-1 flex items-center justify-center p-6 min-h-[calc(100vh-56px)] lg:min-h-screen">
          <LoginPage />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      {/* Mobile Topbar */}
      <header className="flex lg:hidden items-center justify-between h-14 px-4 bg-[#18181be6] border-b border-border-subtle sticky top-0 z-40 backdrop-blur-md">
        <Link className="flex items-center gap-2 font-mono font-bold lowercase text-text-primary hover:text-text-primary" to="/dashboard">
          <GitBranch aria-hidden="true" className="shrink-0 text-accent-primary" size={16} />
          git-arena
        </Link>
        <button
          aria-expanded={mobileNavOpen}
          aria-label="Toggle navigation menu"
          className="inline-flex items-center justify-center gap-2 px-3 py-1 bg-transparent border border-border-strong text-text-primary hover:border-accent-primary hover:bg-bg-surface-hover rounded-md font-mono text-xs uppercase tracking-wider transition-colors min-h-[32px]"
          onClick={() => {
            setMobileNavOpen((open) => !open);
          }}
          type="button"
        >
          {mobileNavOpen ? (
            <>
              <X aria-hidden="true" className="shrink-0" size={14} />
              Close
            </>
          ) : (
            <>
              <Menu aria-hidden="true" className="shrink-0" size={14} />
              Menu
            </>
          )}
        </button>
      </header>

      {/* Mobile Nav Menu */}
      {mobileNavOpen && (
        <nav aria-label="Mobile" className="flex lg:hidden flex-col gap-2 p-4 bg-bg-surface border-b border-border-subtle">
          <NavLink className={navClassName} to="/dashboard">
            <LayoutDashboard aria-hidden="true" className="shrink-0" size={16} />
            Dashboard
            {/* Active Indicator is handled by pseudo element in Tailwind via class below */}
          </NavLink>
          <NavLink className={navClassName} to="/history">
            <History aria-hidden="true" className="shrink-0" size={16} />
            History
          </NavLink>
          <div className="mt-4 pt-4 border-t border-border-subtle flex items-center gap-4 px-2">
            {user.avatarUrl ? (
              <img alt="" className="w-8 h-8 rounded-full border border-border-strong shrink-0" src={user.avatarUrl} />
            ) : (
              <span className="w-8 h-8 rounded-full border border-border-strong shrink-0 flex items-center justify-center bg-accent-primary/10 text-accent-primary font-mono text-xs font-bold" aria-hidden="true">
                {userInitial(user.displayName)}
              </span>
            )}
            <div className="min-w-0">
              <p className="m-0 text-sm font-semibold whitespace-nowrap overflow-hidden text-ellipsis">{user.displayName}</p>
              <p className="m-0 text-xs text-text-secondary font-mono whitespace-nowrap overflow-hidden text-ellipsis">{user.email}</p>
            </div>
          </div>
          <button className="mt-4 inline-flex w-full items-center justify-center gap-2 px-4 py-2 bg-transparent border border-border-strong text-text-primary hover:border-accent-primary hover:bg-bg-surface-hover rounded-lg text-sm font-semibold transition-colors min-h-[40px]" onClick={() => void logout()} type="button">
            <LogOut aria-hidden="true" className="shrink-0" size={15} />
            Logout
          </button>
        </nav>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-[240px] h-screen sticky top-0 bg-bg-surface border-r border-border-subtle p-6 gap-6 z-20 shrink-0">
        <div className="flex flex-col gap-1 px-2">
          <Link className="flex items-center gap-2 font-mono text-lg font-bold tracking-wide lowercase text-text-primary hover:text-text-primary" to="/dashboard">
            <GitBranch aria-hidden="true" className="shrink-0 text-accent-primary" size={16} />
            git-arena
          </Link>
          <span className="text-text-secondary font-mono text-xs uppercase tracking-wider">Git Practice Platform</span>
        </div>

        <nav aria-label="Primary" className="flex flex-col gap-1">
          <NavLink className={({ isActive }) => `flex items-center gap-2 px-4 py-2 rounded-lg text-text-secondary transition-colors relative hover:bg-bg-surface-hover hover:text-text-primary ${isActive ? "bg-accent-primary/10 text-[#7fe5f7] before:content-[''] before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-[calc(100%-16px)] before:w-[3px] before:rounded-r-md before:bg-accent-primary" : ""}`} to="/dashboard">
            <LayoutDashboard aria-hidden="true" className="shrink-0" size={16} />
            Dashboard
          </NavLink>
          <NavLink className={({ isActive }) => `flex items-center gap-2 px-4 py-2 rounded-lg text-text-secondary transition-colors relative hover:bg-bg-surface-hover hover:text-text-primary ${isActive ? "bg-accent-primary/10 text-[#7fe5f7] before:content-[''] before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-[calc(100%-16px)] before:w-[3px] before:rounded-r-md before:bg-accent-primary" : ""}`} to="/history">
            <History aria-hidden="true" className="shrink-0" size={16} />
            History
          </NavLink>
        </nav>

        <div className="mt-auto border-t border-border-subtle pt-6 flex flex-col gap-4">
          <div className="flex items-center gap-4 px-2">
            {user.avatarUrl ? (
              <img alt="" className="w-8 h-8 rounded-full border border-border-strong shrink-0" src={user.avatarUrl} />
            ) : (
              <span className="w-8 h-8 rounded-full border border-border-strong shrink-0 flex items-center justify-center bg-accent-primary/10 text-accent-primary font-mono text-xs font-bold" aria-hidden="true">
                {userInitial(user.displayName)}
              </span>
            )}
            <div className="min-w-0">
              <p className="m-0 text-sm font-semibold whitespace-nowrap overflow-hidden text-ellipsis">{user.displayName}</p>
              <p className="m-0 text-xs text-text-secondary font-mono whitespace-nowrap overflow-hidden text-ellipsis">{user.email}</p>
            </div>
          </div>
          <button className="inline-flex w-full items-center justify-center gap-2 px-4 py-2 bg-transparent border border-border-strong text-text-primary hover:border-accent-primary hover:bg-bg-surface-hover rounded-lg text-sm font-semibold transition-colors min-h-[40px]" onClick={() => void logout()} type="button">
            <LogOut aria-hidden="true" className="shrink-0" size={15} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className={`flex-1 flex flex-col min-w-0 ${isWorkspaceRoute ? "h-[calc(100vh-56px)] lg:h-screen p-0 overflow-hidden" : ""}`}>
        {isWorkspaceRoute ? (
          appRoutes
        ) : (
          <div className="w-full max-w-7xl mx-auto p-4 lg:p-8 flex-1">
            {appRoutes}
          </div>
        )}
      </main>
    </div>
  );
}
