import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Attempt, Scenario } from "@gitarena/shared";

import { createSession, fetchScenario, fetchScenarioAttempts } from "../api/client";

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

    run();
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
    return <p className="state-text">Loading scenario...</p>;
  }

  if (error) {
    return (
      <div className="stack">
        <p className="state-text error">{error}</p>
        <Link className="link" to="/dashboard">
          Back to catalog
        </Link>
      </div>
    );
  }

  if (!scenario) {
    return <p className="state-text error">Scenario not found</p>;
  }

  return (
    <section className="stack">
      <Link className="link" to="/dashboard">
        Back to catalog
      </Link>

      <article className="detail-card">
        <div className="card-top">
          <span className={`badge ${scenario.difficulty}`}>{scenario.difficulty}</span>
          <span className="time">~{scenario.estimatedTimeMinutes} min</span>
        </div>

        <h1>{scenario.title}</h1>
        <p>{scenario.description}</p>

        <h3>Objective</h3>
        <p>{scenario.objective}</p>

        <div className="result-metrics">
          <span>Hints available: {scenario.hints.length}</span>
          <span>Attempts: {attempts.length}</span>
          <span>Best score: {bestScore ?? "-"}</span>
        </div>

        <div className="tag-row">
          {scenario.tags.map((tag) => (
            <span className="tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>

        <button className="button" disabled={starting} onClick={handleStart} type="button">
          {starting ? "Provisioning session..." : "Launch workspace"}
        </button>
      </article>

      {attempts.length > 0 && (
        <article className="detail-card">
          <h3>Recent Attempts</h3>
          <div className="history-list">
            {attempts.slice(0, 5).map((attempt) => (
              <article className="history-item" key={attempt.id}>
                <div>
                  <h3>{new Date(attempt.evaluatedAt).toLocaleString()}</h3>
                  <p>
                    Base {attempt.baseScore} | Bonus +{attempt.timeBonus} | Penalty -
                    {attempt.hintPenalty}
                  </p>
                </div>
                <div className="history-meta">
                  <span className={`score-pill ${attempt.passed ? "pass" : "fail"}`}>
                    {attempt.score}
                  </span>
                  <Link className="link" to={`/sessions/${attempt.sessionId}/result`}>
                    View
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </article>
      )}
    </section>
  );
}
