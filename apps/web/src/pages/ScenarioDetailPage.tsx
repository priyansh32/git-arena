import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Attempt, CreateSessionConflictResponse, Scenario } from "@gitarena/shared";
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Gauge,
  Lightbulb,
  PlayCircle,
  Target
} from "lucide-react";

import { createSession, fetchScenario, fetchScenarioAttempts, isApiError } from "../api/client";

function getDifficultyLabel(difficulty: Scenario["difficulty"]): string {
  if (difficulty === "beginner") return "Beginner";
  if (difficulty === "intermediate") return "Intermediate";
  if (difficulty === "advanced") return "Advanced";
  return difficulty;
}

function getCommonalityLabel(commonality: Scenario["commonality"]): string {
  if (commonality === "very_common") return "Very Common";
  if (commonality === "common") return "Common";
  if (commonality === "occasional") return "Occasional";
  if (commonality === "rare") return "Rare";
  return commonality;
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

  const isSolved = attempts.some((attempt) => attempt.passed);

  if (loading) {
    return (
      <section className="flex flex-col gap-6 w-full max-w-7xl mx-auto" aria-busy="true" aria-live="polite">
        <div className="skeleton h-8 w-64 mb-4" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="skeleton min-h-[400px] lg:col-span-2" />
          <div className="skeleton min-h-[300px] lg:col-span-1" />
        </div>
      </section>
    );
  }

  if (error && !scenario) {
    return (
      <section className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
        <Link className="inline-flex items-center gap-1.5 text-accent-primary font-semibold hover:text-accent-hover hover:underline w-fit" to="/dashboard">
          <ArrowLeft aria-hidden="true" className="shrink-0" size={14} />
          Back to catalog
        </Link>
        <article className="flex flex-col items-center justify-center gap-4 min-h-[120px] p-8 text-center bg-bg-surface border border-border-subtle rounded-xl">
          <p className="m-0 text-status-fail">{error}</p>
        </article>
      </section>
    );
  }

  if (!scenario) {
    return (
      <section className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
        <article className="flex flex-col items-center justify-center gap-4 min-h-[120px] p-8 text-center bg-bg-surface border border-border-subtle rounded-xl">
          <p className="m-0 text-status-fail">Scenario not found</p>
        </article>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-12">
      <Link className="inline-flex items-center gap-1.5 text-accent-primary font-semibold hover:text-accent-hover hover:underline w-fit" to="/dashboard">
        <ArrowLeft aria-hidden="true" className="shrink-0" size={14} />
        Back to catalog
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Main Content */}
        <article className="bg-bg-surface border border-border-subtle rounded-xl p-6 lg:p-8 flex flex-col gap-6 shadow-sm lg:col-span-2">
          <header className="flex flex-col gap-2">
            <h1 className="m-0 flex items-center gap-2 text-[clamp(1.5rem,4vw,2rem)] font-bold tracking-tight leading-[1.2]">
              <Target aria-hidden="true" className="shrink-0 text-accent-primary" size={24} />
              {scenario.title}
            </h1>
            <p className="m-0 text-text-readable text-lg">{scenario.description}</p>
          </header>

          <div className="flex items-center flex-wrap gap-3">
            <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full font-mono text-[11px] font-bold uppercase tracking-wider border leading-none ${scenario.difficulty === 'beginner' ? 'text-status-pass bg-status-pass-bg border-status-pass-border' : scenario.difficulty === 'intermediate' ? 'text-status-warn bg-status-warn-bg border-status-warn-border' : 'text-status-fail bg-status-fail-bg border-status-fail-border'}`}>
              {getDifficultyLabel(scenario.difficulty)}
            </span>
            <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full font-mono text-[11px] font-bold uppercase tracking-wider border leading-none ${scenario.commonality === 'very_common' ? 'text-[#86efac] bg-[#22c55e29] border-[#22c55e66]' : scenario.commonality === 'common' ? 'text-[#67e8f9] bg-[#06b6d424] border-[#06b6d46b]' : scenario.commonality === 'occasional' ? 'text-[#fdba74] bg-[#f9731629] border-[#f973166b]' : 'text-[#c4b5fd] bg-[#8b5cf62b] border-[#8b5cf673]'}`}>
              {getCommonalityLabel(scenario.commonality)}
            </span>
            <span aria-hidden="true" className="text-border-strong px-1">•</span>
            <span className="flex items-center gap-1.5 text-text-readable font-mono text-sm">
              <Clock3 aria-hidden="true" className="shrink-0" size={14} />
              ~{scenario.estimatedTimeMinutes} min
            </span>
            <span
              className={`inline-flex items-center justify-center px-3 py-1 rounded-full font-mono text-[11px] font-bold uppercase tracking-wider border leading-none ${isSolved ? "text-status-pass bg-status-pass-bg border-status-pass-border" : "text-status-secondary bg-bg-surface-soft border-border-strong"}`}
            >
              {isSolved ? "Solved" : "Unsolved"}
            </span>
          </div>

          <div className="flex flex-col gap-4 text-text-readable leading-relaxed">
            <h2 className="m-0 flex items-center gap-2 text-xl font-bold text-text-primary border-b border-border-subtle pb-2">
              <Target aria-hidden="true" className="shrink-0 text-accent-primary" size={20} />
              Objective
            </h2>
            <p className="m-0">{scenario.objective}</p>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 m-0 mt-4">
            <div className="bg-bg-surface-soft border border-border-strong rounded-xl p-4 flex flex-col gap-1 shadow-sm">
              <dt className="m-0 text-text-secondary font-mono text-[11px] font-semibold uppercase tracking-wider">Hints Available</dt>
              <dd className="m-0 font-mono text-xl font-bold flex items-center gap-2">
                <Lightbulb aria-hidden="true" className="shrink-0 text-status-warn" size={20} />
                {scenario.hints.length}
              </dd>
            </div>
            <div className="bg-bg-surface-soft border border-border-strong rounded-xl p-4 flex flex-col gap-1 shadow-sm">
              <dt className="m-0 text-text-secondary font-mono text-[11px] font-semibold uppercase tracking-wider">Total Attempts</dt>
              <dd className="m-0 font-mono text-xl font-bold flex items-center gap-2 capitalize">
                <Gauge aria-hidden="true" className="shrink-0 text-accent-primary" size={20} />
                {attempts.length}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2 mt-4">
            {scenario.tags.map((tag) => (
              <span className="bg-bg-surface-soft border border-border-strong text-text-primary text-[11px] font-mono px-2 py-1 rounded-full" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </article>

        {/* Sidebar Actions */}
        <aside className="bg-bg-surface border border-border-subtle rounded-xl p-6 flex flex-col gap-6 shadow-sm lg:col-span-1 lg:sticky lg:top-[calc(56px+24px)]">
          <div className="flex flex-col gap-4 border-b border-border-subtle pb-6">
            <h2 className="m-0 flex items-center gap-2 text-lg font-bold">
              <PlayCircle aria-hidden="true" className="shrink-0 text-accent-primary" size={20} />
              Session
            </h2>
            <p className="m-0 text-text-secondary text-sm leading-relaxed">Start a new terminal session for this scenario.</p>
            <button
              className="inline-flex w-full items-center justify-center gap-2 px-4 py-2 bg-accent-primary text-bg-base hover:bg-accent-hover rounded-md text-sm font-bold min-h-[44px] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              disabled={starting}
              onClick={() => void handleStart()}
              type="button"
            >
              {starting ? "Provisioning..." : "Start Session"}
              {!starting && <PlayCircle aria-hidden="true" className="shrink-0" size={16} />}
            </button>
            {error && <p className="m-0 text-status-fail bg-status-fail-bg border border-status-fail-border p-3 rounded-lg text-sm mt-2">{error}</p>}
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="m-0 flex items-center gap-2 text-base font-bold text-text-primary">
              <Gauge aria-hidden="true" className="shrink-0 text-accent-primary" size={16} />
              Recent Attempts
            </h3>

            {attempts.length === 0 ? (
              <p className="m-0 text-text-secondary text-sm">No attempts yet.</p>
            ) : (
              <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto scrollbar-hide pr-1">
                {attempts.slice(0, 5).map((attempt) => (
                  <article className="border border-border-strong rounded-lg p-3 flex flex-col gap-1.5 bg-bg-surface-soft" key={attempt.id}>
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider border leading-none ${attempt.passed ? 'text-status-pass bg-status-pass-bg border-status-pass-border' : 'text-status-fail bg-status-fail-bg border-status-fail-border'}`}>
                        {attempt.passed ? "Pass" : "Fail"}
                      </span>
                      <span className="font-mono font-bold text-sm">
                        {attempt.assertions.filter((assertion) => assertion.passed).length}/
                        {attempt.assertions.length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <p className="m-0 font-mono text-xs text-text-secondary">{new Date(attempt.evaluatedAt).toLocaleDateString()}</p>
                      <Link className="inline-flex items-center gap-1 text-accent-primary font-semibold hover:text-accent-hover hover:underline text-xs" to={`/sessions/${attempt.sessionId}/result`}>
                        View Result
                        <ArrowRight aria-hidden="true" className="shrink-0" size={12} />
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
