import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Attempt, Scenario } from "@gitarena/shared";

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

    run();
  }, []);

  const scenarioTitleById = useMemo(() => {
    return new Map(scenarios.map((scenario) => [scenario.id, scenario.title]));
  }, [scenarios]);

  if (loading) {
    return <p className="state-text">Loading history...</p>;
  }

  if (error) {
    return <p className="state-text error">{error}</p>;
  }

  return (
    <section className="stack">
      <div className="page-head">
        <h1>Attempt History</h1>
        <p>All attempts for your current local profile.</p>
      </div>

      {attempts.length === 0 ? (
        <article className="detail-card">
          <p>No attempts yet. Start a scenario from the dashboard.</p>
          <Link className="button" to="/dashboard">
            Browse Scenarios
          </Link>
        </article>
      ) : (
        <div className="history-list">
          {attempts.map((attempt) => (
            <article className="history-item" key={attempt.id}>
              <div>
                <h3>{scenarioTitleById.get(attempt.scenarioId) ?? attempt.scenarioId}</h3>
                <p>{new Date(attempt.evaluatedAt).toLocaleString()}</p>
              </div>

              <div className="history-meta">
                <span className={`score-pill ${attempt.passed ? "pass" : "fail"}`}>
                  {attempt.score}
                </span>
                <span>{attempt.passed ? "pass" : "fail"}</span>
                <Link className="link" to={`/sessions/${attempt.sessionId}/result`}>
                  View result
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
