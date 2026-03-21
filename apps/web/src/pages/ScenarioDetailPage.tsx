import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Attempt, CreateSessionConflictResponse, Scenario } from "@gitarena/shared";

import { createSession, fetchScenario, fetchScenarioAttempts, isApiError } from "../api/client";

function getCommonalityLabel(commonality: Scenario["commonality"]): string {
  if (commonality === "very_common") {
    return "Very Common";
  }
  if (commonality === "common") {
    return "Common";
  }
  if (commonality === "occasional") {
    return "Occasional";
  }
  return "Rare";
}

export function ScenarioDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("Scenario ID is missing");
      setLoading(false);
      return;
    }

    const run = async () => {
      try {
        const [scenarioData, attemptData] = await Promise.all([
          fetchScenario(id),
          fetchScenarioAttempts(id)
        ]);

        setScenario(scenarioData);
        setAttempts(attemptData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load scenario");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [id]);

  const handleStart = async () => {
    if (!scenario) {
      return;
    }

    setStarting(true);
    setError(null);

    try {
      const session = await createSession(scenario.id);
      navigate(`/sessions/${session.id}`);
    } catch (err) {
      if (isApiError<CreateSessionConflictResponse>(err) && err.status === 409) {
        const activeSessionId = err.payload?.session?.id;
        if (activeSessionId) {
          navigate(`/sessions/${activeSessionId}`);
          return;
        }
      }

      setError(err instanceof Error ? err.message : "Unable to create session");
    } finally {
      setStarting(false);
    }
  };

  const bestScore = useMemo(() => {
    if (attempts.length === 0) {
      return null;
    }

    return Math.max(...attempts.map((attempt) => attempt.score));
  }, [attempts]);

  if (loading) {
    return (
      <section className="page" aria-busy="true" aria-live="polite">
        <div className="skeleton skeleton-title" />
        <div className="scenario-detail-layout">
          <div className="skeleton skeleton-card scenario-main-column" />
          <div className="skeleton skeleton-card scenario-actions-column" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="page">
        <Link className="text-link" to="/dashboard">
          Back to catalog
        </Link>
        <article className="panel state-surface">
          <p className="state-text error">{error}</p>
        </article>
      </section>
    );
  }

  if (!scenario) {
    return (
      <section className="page">
        <article className="panel state-surface">
          <p className="state-text error">Scenario not found</p>
        </article>
      </section>
    );
  }

  return (
    <section className="page">
      <Link className="text-link" to="/dashboard">
        Back to catalog
      </Link>

      <div className="scenario-detail-layout">
        <article className="panel scenario-main scenario-main-column">
          <header className="page-header">
            <h1>{scenario.title}</h1>
            <p>{scenario.description}</p>
          </header>

          <div className="scenario-meta-row">
            <span className={`badge ${scenario.difficulty}`}>{scenario.difficulty}</span>
            <span className={`commonality-pill ${scenario.commonality}`}>
              {getCommonalityLabel(scenario.commonality)}
            </span>
            <span aria-hidden="true" className="scenario-meta-separator">
              •
            </span>
            <span className="mono scenario-meta-time">~{scenario.estimatedTimeMinutes}m</span>
          </div>

          <h2>Objective</h2>
          <p>{scenario.objective}</p>

          <dl className="metric-grid">
            <div className="metric-card">
              <dt>Hints Available</dt>
              <dd>{scenario.hints.length}</dd>
            </div>
            <div className="metric-card">
              <dt>Total Attempts</dt>
              <dd>{attempts.length}</dd>
            </div>
            <div className="metric-card">
              <dt>Best Score</dt>
              <dd>{bestScore ?? "-"}</dd>
            </div>
          </dl>

          <div className="scenario-tags">
            {scenario.tags.map((tag) => (
              <span className="scenario-tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </article>

        <aside className="panel scenario-actions scenario-actions-column">
          <h2>Session</h2>
          <p className="state-text">Start a new terminal session for this scenario.</p>
          <button
            className="button button-primary button-block"
            disabled={starting}
            onClick={handleStart}
            type="button"
          >
            {starting ? "Provisioning..." : "Start Session"}
          </button>

          <h3>Recent Attempts</h3>
          {attempts.length === 0 ? (
            <p className="state-text">No attempts yet.</p>
          ) : (
            <div className="attempt-list">
              {attempts.slice(0, 5).map((attempt) => (
                <article className="attempt-row" key={attempt.id}>
                  <div className="attempt-row-head">
                    <span className={`badge ${attempt.passed ? "pass" : "fail"}`}>
                      {attempt.passed ? "Pass" : "Fail"}
                    </span>
                    <span className="mono">{attempt.score}</span>
                  </div>
                  <p className="mono">{new Date(attempt.evaluatedAt).toLocaleString()}</p>
                  <Link className="text-link" to={`/sessions/${attempt.sessionId}/result`}>
                    View Result
                  </Link>
                </article>
              ))}
            </div>
          )}

          {error && <p className="state-text error">{error}</p>}
        </aside>
      </div>
    </section>
  );
}
