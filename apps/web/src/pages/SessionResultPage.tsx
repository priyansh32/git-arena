import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Attempt, Scenario, Session } from "@gitarena/shared";

import { fetchScenario, fetchSessionResult } from "../api/client";

export function SessionResultPage() {
  const { id } = useParams();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("Session ID is missing");
      setLoading(false);
      return;
    }

    const run = async () => {
      try {
        const result = await fetchSessionResult(id);
        setAttempt(result.attempt);
        setSession(result.session);

        const loadedScenario = await fetchScenario(result.session.scenarioId);
        setScenario(loadedScenario);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load result");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [id]);

  const scoreLabel = useMemo(() => {
    if (!attempt) {
      return "-";
    }

    return `${attempt.score}/100`;
  }, [attempt]);

  if (loading) {
    return (
      <section className="page" aria-busy="true" aria-live="polite">
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
      </section>
    );
  }

  if (error || !attempt || !session) {
    return (
      <section className="page">
        <article className="panel state-surface">
          <p className="state-text error">{error ?? "Result not found"}</p>
          <Link className="text-link" to="/dashboard">
            Back to catalog
          </Link>
        </article>
      </section>
    );
  }

  return (
    <section className="page">
      <article className="panel result-hero">
        <h1>{scenario?.title ?? "Session Result"}</h1>
        <p className="state-text">{attempt.passed ? "Passed" : "Not passed"}</p>
        <div className={`score-pill-hero ${attempt.passed ? "pass" : "fail"}`}>{scoreLabel}</div>
      </article>

      <dl className="metric-grid">
        <div className="metric-card">
          <dt>Base Score</dt>
          <dd>{attempt.baseScore}</dd>
        </div>
        <div className="metric-card">
          <dt>Time Bonus</dt>
          <dd>+{attempt.timeBonus}</dd>
        </div>
        <div className="metric-card">
          <dt>Hint Penalty</dt>
          <dd>-{attempt.hintPenalty}</dd>
        </div>
      </dl>

      <article className="panel">
        <table className="result-assertions">
          <tbody>
            {attempt.assertions.map((assertion) => (
              <tr key={assertion.checkId}>
                <td>
                  <span className={`assertion-icon ${assertion.passed ? "pass" : "fail"}`}>
                    {assertion.passed ? "OK" : "X"}
                  </span>
                </td>
                <td>
                  <div className="assertion-text">
                    <h3>{assertion.checkId}</h3>
                    <p>{assertion.explanation}</p>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>

      <div className="scenario-card-top">
        <Link className="button button-primary" to={`/scenarios/${session.scenarioId}`}>
          Retry Scenario
        </Link>
        <Link className="button button-secondary" to="/history">
          View History
        </Link>
      </div>
    </section>
  );
}
