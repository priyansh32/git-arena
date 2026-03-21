import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Attempt, Scenario, Session } from "@gitarena/shared";
import { CheckCircle2, RotateCcw, ShieldCheck, Trophy, XCircle } from "lucide-react";

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

  const checkSummary = useMemo(() => {
    if (!attempt) {
      return {
        total: 0,
        passed: 0,
        failed: 0
      };
    }

    const total = attempt.assertions.length;
    const passed = attempt.assertions.filter((assertion) => assertion.passed).length;
    return {
      total,
      passed,
      failed: total - passed
    };
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
            <RotateCcw aria-hidden="true" className="inline-icon" size={13} />
            Back to catalog
          </Link>
        </article>
      </section>
    );
  }

  return (
    <section className="page">
      <article className="panel result-hero">
        <h1 className="page-title">
          <Trophy aria-hidden="true" className="inline-icon title-icon" size={20} />
          {scenario?.title ?? "Session Result"}
        </h1>
        <p className="state-text">
          {checkSummary.passed}/{checkSummary.total} checks passed
        </p>
        <div className={`score-pill-hero ${attempt.passed ? "pass" : "fail"}`}>
          {attempt.passed ? "PASS" : "FAIL"}
        </div>
      </article>

      <dl className="metric-grid">
        <div className="metric-card">
          <dt>Total Checks</dt>
          <dd>{checkSummary.total}</dd>
        </div>
        <div className="metric-card">
          <dt>Passed Checks</dt>
          <dd>{checkSummary.passed}</dd>
        </div>
        <div className="metric-card">
          <dt>Failed Checks</dt>
          <dd>{checkSummary.failed}</dd>
        </div>
      </dl>

      <article className="panel">
        <table className="result-assertions">
          <tbody>
            {attempt.assertions.map((assertion) => (
              <tr key={assertion.checkId}>
                <td>
                  <span className={`assertion-icon ${assertion.passed ? "pass" : "fail"}`}>
                    {assertion.passed ? (
                      <CheckCircle2 aria-hidden="true" className="inline-icon" size={14} />
                    ) : (
                      <XCircle aria-hidden="true" className="inline-icon" size={14} />
                    )}
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
          <RotateCcw aria-hidden="true" className="inline-icon" size={15} />
          Retry Scenario
        </Link>
        <Link className="button button-secondary" to="/history">
          <ShieldCheck aria-hidden="true" className="inline-icon" size={15} />
          View History
        </Link>
      </div>
    </section>
  );
}
