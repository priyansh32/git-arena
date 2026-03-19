import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Scenario } from "@gitarena/shared";

import { fetchScenarios } from "../api/client";

export function DashboardPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const data = await fetchScenarios();
        setScenarios(data);
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

  return (
    <section className="stack">
      <div className="page-head">
        <h1>Scenario Catalog</h1>
        <p>Start with one challenge and ship a clean Git outcome.</p>
      </div>

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
