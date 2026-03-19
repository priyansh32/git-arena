import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Scenario } from "@gitarena/shared";

import { createSession, fetchScenario } from "../api/client";

export function ScenarioDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [scenario, setScenario] = useState<Scenario | null>(null);
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
        const data = await fetchScenario(id);
        setScenario(data);
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
    </section>
  );
}
