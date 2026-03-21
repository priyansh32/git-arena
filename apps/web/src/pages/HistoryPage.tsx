import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Attempt } from "@gitarena/shared";
import { CalendarDays, Eye, History, Trophy } from "lucide-react";

import { fetchUserHistory } from "../api/client";

export function HistoryPage() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchUserHistory();
        setAttempts(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load history");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  if (loading) {
    return (
      <section className="flex flex-col gap-6 w-full" aria-busy="true" aria-live="polite">
        <header className="flex flex-col gap-2">
          <h1 className="m-0 flex items-center gap-2 text-[clamp(1.5rem,4vw,2rem)] font-bold tracking-tight leading-[1.2]">
            <History aria-hidden="true" className="shrink-0 text-accent-primary" size={20} />
            Session History
          </h1>
          <p className="m-0 text-text-readable text-lg max-w-[64ch]">Review your past scenario attempts and scores.</p>
        </header>
        <div className="skeleton h-[200px]" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="flex flex-col gap-6 w-full">
        <header className="flex flex-col gap-2">
          <h1 className="m-0 flex items-center gap-2 text-[clamp(1.5rem,4vw,2rem)] font-bold tracking-tight leading-[1.2]">
            <History aria-hidden="true" className="shrink-0 text-accent-primary" size={20} />
            Session History
          </h1>
          <p className="m-0 text-text-readable text-lg max-w-[64ch]">Review your past scenario attempts and scores.</p>
        </header>
        <article className="flex flex-col items-center justify-center gap-4 min-h-[120px] p-8 text-center bg-bg-surface border border-border-subtle rounded-xl">
          <p className="m-0 text-status-fail">{error}</p>
        </article>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6 w-full">
      <header className="flex flex-col gap-2">
        <h1 className="m-0 flex items-center gap-2 text-[clamp(1.5rem,4vw,2rem)] font-bold tracking-tight leading-[1.2]">
          <History aria-hidden="true" className="shrink-0 text-accent-primary" size={20} />
          Session History
        </h1>
        <p className="m-0 text-text-readable text-lg max-w-[64ch]">Review your past scenario attempts and scores.</p>
      </header>

      {attempts.length === 0 ? (
        <article className="flex flex-col items-center justify-center gap-4 min-h-[120px] p-8 text-center bg-bg-surface border border-border-subtle rounded-xl">
          <p className="m-0 text-text-secondary">No attempts yet. Start a scenario from the dashboard.</p>
          <Link className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-accent-primary text-bg-base hover:bg-accent-hover rounded-md text-sm font-bold min-h-[40px] transition-colors" to="/dashboard">
            <Trophy aria-hidden="true" className="shrink-0" size={15} />
            Browse Scenarios
          </Link>
        </article>
      ) : (
        <div className="w-full overflow-x-auto bg-bg-surface border border-border-subtle rounded-xl shadow-sm">
          <table className="w-full min-w-[800px] border-collapse">
            <thead>
              <tr>
                <th className="bg-bg-surface-soft text-text-secondary font-mono text-xs font-semibold uppercase tracking-wider p-4 text-left border-b border-border-subtle">Scenario</th>
                <th className="bg-bg-surface-soft text-text-secondary font-mono text-xs font-semibold uppercase tracking-wider p-4 text-left border-b border-border-subtle">
                  <span className="flex items-center gap-1.5">
                    <CalendarDays aria-hidden="true" className="shrink-0" size={13} />
                    Date Evaluated
                  </span>
                </th>
                <th className="bg-bg-surface-soft text-text-secondary font-mono text-xs font-semibold uppercase tracking-wider p-4 text-left border-b border-border-subtle">Status</th>
                <th className="bg-bg-surface-soft text-text-secondary font-mono text-xs font-semibold uppercase tracking-wider p-4 text-left border-b border-border-subtle">
                  <span className="flex items-center gap-1.5">
                    <Trophy aria-hidden="true" className="shrink-0" size={13} />
                    Score
                  </span>
                </th>
                <th className="bg-bg-surface-soft text-text-secondary font-mono text-xs font-semibold uppercase tracking-wider p-4 text-left border-b border-border-subtle">Actions</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((attempt) => (
                <tr key={attempt.id} className="hover:bg-bg-surface-hover/50 transition-colors">
                  <td className="p-4 text-sm border-b border-border-subtle last:border-b-0">
                    <Link className="text-accent-primary font-semibold hover:text-accent-hover hover:underline" to={`/scenarios/${attempt.scenarioId}`}>
                      {attempt.scenarioId}
                    </Link>
                  </td>
                  <td className="p-4 text-sm border-b border-border-subtle last:border-b-0 font-mono text-text-secondary">{new Date(attempt.evaluatedAt).toLocaleString()}</td>
                  <td className="p-4 text-sm border-b border-border-subtle last:border-b-0">
                    <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full font-mono text-[11px] font-bold uppercase tracking-wider border leading-none ${attempt.passed ? "text-status-pass bg-status-pass-bg border-status-pass-border" : "text-status-fail bg-status-fail-bg border-status-fail-border"}`}>
                      {attempt.passed ? "Pass" : "Fail"}
                    </span>
                  </td>
                  <td className="p-4 text-sm border-b border-border-subtle last:border-b-0 font-mono font-semibold">
                    {Math.round(attempt.score)}%
                  </td>
                  <td className="p-4 text-sm border-b border-border-subtle last:border-b-0">
                    <Link className="inline-flex items-center gap-1.5 text-accent-primary font-semibold hover:text-accent-hover hover:underline text-sm" to={`/sessions/${attempt.sessionId}/result`}>
                      <Eye aria-hidden="true" className="shrink-0" size={13} />
                      View Result
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
