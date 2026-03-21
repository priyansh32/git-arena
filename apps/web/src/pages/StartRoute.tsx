import { Navigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";

export function StartRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg-base p-6">
        <section className="w-full max-w-md rounded-xl border border-border-subtle bg-bg-surface p-8 text-center">
          <p className="m-0 text-sm text-text-secondary">Checking session...</p>
        </section>
      </main>
    );
  }

  if (user) {
    return <Navigate replace to="/dashboard" />;
  }

  return <Navigate replace to="/login?next=%2Fdashboard" />;
}
