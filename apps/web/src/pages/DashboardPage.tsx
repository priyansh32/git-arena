import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Scenario, Session } from "@gitarena/shared";

import { fetchActiveSession, fetchScenarios } from "../api/client";

function getRemainingLabel(expiresAt: string): string {
  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  if (remainingMs <= 0) {
    return "expired";
  }

  const totalMinutes = Math.ceil(remainingMs / 60000);
  return `${totalMinutes} min left`;
}

export function DashboardPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const [scenarioData, activeSessionData] = await Promise.all([
          fetchScenarios(),
          fetchActiveSession()
        ]);

        setScenarios(scenarioData);
        setActiveSession(activeSessionData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load scenarios");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, []);

  if (loading) {
    return <p className="state-text">Loading scenarios...</p>;
  }

  if (error) {
    return <p className="state-text error">{error}</p>;
  }

  const activeScenarioTitle =
    scenarios.find((scenario) => scenario.id === activeSession?.scenarioId)?.title ??
    activeSession?.scenarioId;

  return (
    <section className="stack">
      <div className="page-head">
        <h1>Scenario Catalog</h1>
        <p>Start with one challenge and ship a clean Git outcome.</p>
      </div>

      {activeSession && (
        <article className="detail-card">
          <h3>Active Session</h3>
          <p>
            {activeScenarioTitle} • {getRemainingLabel(activeSession.expiresAt)}
          </p>
          <Link className="button" to={`/sessions/${activeSession.id}`}>
            Resume workspace
          </Link>
        </article>
      )}

      <div className="grid">
        {scenarios.map((scenario) => (
          <article className="card" key={scenario.id}>
            <div className="card-top">
              <span className={`badge ${scenario.difficulty}`}>{scenario.difficulty}</span>
              <span className="time">~{scenario.estimatedTimeMinutes} min</span>
            </div>

            <h2>{scenario.title}</h2>
            <p>{scenario.description}</p>

            <div className="tag-row">
              {scenario.tags.map((tag) => (
                <span className="tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>

            <Link className="button" to={`/scenarios/${scenario.id}`}>
              Start
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
