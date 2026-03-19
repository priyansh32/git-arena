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

    run();
  }, [id]);

  const scoreLabel = useMemo(() => {
    if (!attempt) {
      return "-";
    }

    return `${attempt.score}/100`;
  }, [attempt]);

  if (loading) {
    return <p className="state-text">Loading result...</p>;
  }

  if (error || !attempt || !session) {
    return (
      <div className="stack">
        <p className="state-text error">{error ?? "Result not found"}</p>
        <Link className="link" to="/dashboard">
          Back to catalog
        </Link>
      </div>
    );
  }

  return (
    <section className="stack">
      <div className="result-head">
        <div>
          <h1>{scenario?.title ?? "Session Result"}</h1>
          <p>{attempt.passed ? "Passed" : "Not passed"}</p>
        </div>
        <div className={`score-pill ${attempt.passed ? "pass" : "fail"}`}>{scoreLabel}</div>
      </div>

      <article className="detail-card">
        <h3>Breakdown</h3>

        <div className="result-metrics">
          <span>Base: {attempt.baseScore}</span>
          <span>Time bonus: +{attempt.timeBonus}</span>
          <span>Hint penalty: -{attempt.hintPenalty}</span>
          <span>Evaluated: {new Date(attempt.evaluatedAt).toLocaleString()}</span>
        </div>

        <div className="assertion-list">
          {attempt.assertions.map((assertion) => (
            <article className="assertion" key={assertion.checkId}>
              <div className={`assertion-status ${assertion.passed ? "pass" : "fail"}`}>
                {assertion.passed ? "PASS" : "FAIL"}
              </div>
              <div>
                <h4>{assertion.checkId}</h4>
                <p>{assertion.explanation}</p>
              </div>
            </article>
          ))}
        </div>

        <div className="panel-actions">
          <Link className="button" to={`/scenarios/${session.scenarioId}`}>
            Retry Scenario
          </Link>
          <Link className="button subtle" to="/history">
            View History
          </Link>
        </div>
      </article>
    </section>
  );
}
