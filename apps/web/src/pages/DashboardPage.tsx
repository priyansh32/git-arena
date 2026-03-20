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

    void run();
  }, []);

  const activeScenarioTitle =
    scenarios.find((scenario) => scenario.id === activeSession?.scenarioId)?.title ??
    activeSession?.scenarioId;

  if (loading) {
    return (
      <section className="page" aria-busy="true" aria-live="polite">
        <header className="page-header">
          <h1>Scenario Catalog</h1>
          <p>Start with one challenge and ship a clean Git outcome.</p>
        </header>
        <div className="skeleton skeleton-card" />
        <div className="dashboard-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="skeleton skeleton-card" key={index} />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="page">
        <header className="page-header">
          <h1>Scenario Catalog</h1>
          <p>Start with one challenge and ship a clean Git outcome.</p>
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
        <h1>Scenario Catalog</h1>
        <p>Start with one challenge and ship a clean Git outcome.</p>
      </header>

      {activeSession && (
        <article className="panel active-session-banner">
          <p className="active-session-banner-title">Active Session</p>
          <div className="active-session-row">
            <p>
              <span className="mono">{activeScenarioTitle}</span> - {getRemainingLabel(activeSession.expiresAt)}
            </p>
            <Link className="button button-primary" to={`/sessions/${activeSession.id}`}>
              Resume Workspace
            </Link>
          </div>
        </article>
      )}

      <div className="dashboard-grid">
        {scenarios.map((scenario) => (
          <article className="scenario-card" key={scenario.id}>
            <div className="scenario-card-top">
              <span className={`badge ${scenario.difficulty}`}>{scenario.difficulty}</span>
              <span className="mono state-text">~{scenario.estimatedTimeMinutes}m</span>
            </div>

            <h2>{scenario.title}</h2>
            <p>{scenario.description}</p>

            <div className="scenario-tags">
              {scenario.tags.map((tag) => (
                <span className="scenario-tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>

            <Link className="button button-primary" to={`/scenarios/${scenario.id}`}>
              Open Scenario
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
