import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Attempt, Scenario, Session } from "@gitarena/shared";
import { CheckCircle2, RotateCcw, ShieldCheck, Trophy, XCircle } from "lucide-react";

import { fetchScenario, fetchSessionResult } from "../api/client";

function getScoreColor(passed: boolean): string {
  if (passed) {
    return "text-status-pass border-status-pass shadow-lg shadow-status-pass/20";
  }
  return "text-status-fail border-status-fail shadow-lg shadow-status-fail/20";
}

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
      <section className="flex flex-col gap-6 w-full max-w-4xl mx-auto" aria-busy="true" aria-live="polite">
        <div className="skeleton min-h-[300px]" />
        <div className="skeleton min-h-[400px]" />
      </section>
    );
  }

  if (error || !attempt || !session) {
    return (
      <section className="flex flex-col gap-6 w-full max-w-4xl mx-auto">
        <article className="flex flex-col items-center justify-center gap-4 min-h-[120px] p-8 text-center bg-bg-surface border border-border-subtle rounded-xl">
          <p className="m-0 text-status-fail">{error ?? "Result not found"}</p>
          <Link className="inline-flex items-center gap-1.5 text-accent-primary font-semibold hover:text-accent-hover hover:underline" to="/dashboard">
            <RotateCcw aria-hidden="true" className="shrink-0" size={13} />
            Return to Dashboard
          </Link>
        </article>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-8 w-full max-w-4xl mx-auto pb-12">
      <article className="flex flex-col items-center text-center gap-4 bg-bg-surface border border-border-subtle rounded-xl p-12 md:p-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-bg-base/50 pointer-events-none" />
        
        <h1 className="m-0 flex items-center justify-center gap-2 text-[clamp(2rem,5vw,3rem)] font-bold tracking-tight leading-[1.2] relative z-10">
          <Trophy aria-hidden="true" className="shrink-0 text-accent-primary" size={32} />
          {scenario?.title ?? "Session Result"}
        </h1>
        <p className="m-0 text-text-readable text-lg max-w-[40ch] relative z-10">
          {checkSummary.passed}/{checkSummary.total} checks passed
        </p>

        <div className={`mt-4 inline-flex items-center justify-center min-w-[176px] px-8 py-3 border-2 rounded-full font-mono text-[clamp(2rem,5vw,3rem)] font-bold tracking-wider relative z-10 ${getScoreColor(attempt.passed)} bg-bg-surface/80 backdrop-blur-sm`}>
          {attempt.passed ? "PASS" : "FAIL"}
        </div>
      </article>

      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 m-0">
        <div className="bg-bg-surface-soft border border-border-strong rounded-xl p-4 flex flex-col gap-1 shadow-sm">
          <dt className="m-0 text-text-secondary font-mono text-[11px] font-semibold uppercase tracking-wider">Total Checks</dt>
          <dd className="m-0 font-mono text-xl font-bold flex items-center gap-2">{checkSummary.total}</dd>
        </div>
        <div className="bg-bg-surface-soft border border-border-strong rounded-xl p-4 flex flex-col gap-1 shadow-sm">
          <dt className="m-0 text-text-secondary font-mono text-[11px] font-semibold uppercase tracking-wider">Passed Checks</dt>
          <dd className="m-0 font-mono text-xl font-bold flex items-center gap-2">{checkSummary.passed}</dd>
        </div>
        <div className="bg-bg-surface-soft border border-border-strong rounded-xl p-4 flex flex-col gap-1 shadow-sm">
          <dt className="m-0 text-text-secondary font-mono text-[11px] font-semibold uppercase tracking-wider">Failed Checks</dt>
          <dd className="m-0 font-mono text-xl font-bold flex items-center gap-2">{checkSummary.failed}</dd>
        </div>
      </dl>

      <article className="bg-bg-surface border border-border-subtle rounded-xl p-6 flex flex-col gap-4 shadow-sm">
        <h2 className="m-0 text-xl font-bold">Assertion Results</h2>
        <div className="w-full overflow-hidden border border-border-subtle rounded-lg">
          <table className="w-full border-collapse">
            <tbody>
              {attempt.assertions.map((assertion) => (
                <tr className="border-b border-border-subtle last:border-b-0 hover:bg-bg-surface-soft/50 transition-colors" key={assertion.checkId}>
                  <td className="p-4 align-top w-12">
                    <span className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 ${assertion.passed ? "text-status-pass border-status-pass bg-status-pass-bg/50" : "text-status-fail border-status-fail bg-status-fail-bg/50"}`}>
                      {assertion.passed ? (
                        <CheckCircle2 aria-hidden="true" className="shrink-0" size={16} />
                      ) : (
                        <XCircle aria-hidden="true" className="shrink-0" size={16} />
                      )}
                    </span>
                  </td>
                  <td className="p-4 align-top">
                    <div className="flex flex-col gap-1.5">
                      <h3 className="m-0 text-base font-semibold">{assertion.checkId}</h3>
                      <p className="m-0 text-sm text-text-secondary">{assertion.explanation}</p>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <div className="flex flex-col sm:flex-row items-center gap-4 mt-4">
        <Link className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-6 py-2.5 bg-accent-primary text-bg-base hover:bg-accent-hover rounded-md text-sm font-bold transition-colors shadow-sm" to={`/scenarios/${session.scenarioId}`}>
          <RotateCcw aria-hidden="true" className="shrink-0" size={16} />
          Retry Scenario
        </Link>
        <Link className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-6 py-2.5 bg-transparent border border-border-strong text-text-primary hover:border-accent-primary hover:bg-bg-surface-hover rounded-md text-sm font-bold transition-colors shadow-sm" to="/history">
          <ShieldCheck aria-hidden="true" className="shrink-0" size={16} />
          View History
        </Link>
      </div>
    </section>
  );
}
