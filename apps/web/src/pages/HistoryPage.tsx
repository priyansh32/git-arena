import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Attempt, Scenario } from "@gitarena/shared";
import { CalendarDays, Eye, History, Trophy } from "lucide-react";

import { fetchScenarios, fetchUserHistory } from "../api/client";

export function HistoryPage() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const [historyData, scenarioData] = await Promise.all([
          fetchUserHistory(),
          fetchScenarios()
        ]);

        setAttempts(historyData);
        setScenarios(scenarioData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load history");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, []);

  const scenarioTitleById = useMemo(() => {
    return new Map(scenarios.map((scenario) => [scenario.id, scenario.title]));
  }, [scenarios]);

  if (loading) {
    return (
      <section className="page" aria-busy="true" aria-live="polite">
        <header className="page-header">
          <h1 className="page-title">
            <History aria-hidden="true" className="inline-icon title-icon" size={20} />
            Attempt History
          </h1>
          <p>Your past attempt outcomes across all scenarios.</p>
        </header>
        <div className="skeleton skeleton-card" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">
            <History aria-hidden="true" className="inline-icon title-icon" size={20} />
            Attempt History
          </h1>
          <p>Your past attempt outcomes across all scenarios.</p>
        </header>
        <article className="panel state-surface">
          <p className="state-text error">{error}</p>
        </article>
      </section>
    );
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1 className="page-title">
          <History aria-hidden="true" className="inline-icon title-icon" size={20} />
          Attempt History
        </h1>
        <p>Your past attempt outcomes across all scenarios.</p>
      </header>

      {attempts.length === 0 ? (
        <article className="panel state-surface">
          <p className="state-text">No attempts yet. Start a scenario from the dashboard.</p>
          <Link className="button button-primary" to="/dashboard">
            <Trophy aria-hidden="true" className="inline-icon" size={15} />
            Browse Scenarios
          </Link>
        </article>
      ) : (
        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>
                  <span className="table-head-label">
                    <CalendarDays aria-hidden="true" className="inline-icon" size={13} />
                    Date
                  </span>
                </th>
                <th>Scenario</th>
                <th>Status</th>
                <th>
                  <span className="table-head-label">
                    <Trophy aria-hidden="true" className="inline-icon" size={13} />
                    Checks
                  </span>
                </th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((attempt) => (
                <tr key={attempt.id}>
                  <td className="date-col">{new Date(attempt.evaluatedAt).toLocaleString()}</td>
                  <td>{scenarioTitleById.get(attempt.scenarioId) ?? attempt.scenarioId}</td>
                  <td>
                    <span className={`badge ${attempt.passed ? "pass" : "fail"}`}>
                      {attempt.passed ? "Pass" : "Fail"}
                    </span>
                  </td>
                  <td className="score-col">
                    {attempt.assertions.filter((assertion) => assertion.passed).length}/
                    {attempt.assertions.length}
                  </td>
                  <td>
                    <Link to={`/sessions/${attempt.sessionId}/result`}>
                      <Eye aria-hidden="true" className="inline-icon" size={13} />
                      View
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
