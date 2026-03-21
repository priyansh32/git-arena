import { useEffect, useMemo, useState } from "react";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<Scenario["difficulty"] | "all">("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"default" | "timeAsc" | "timeDesc" | "difficulty">("default");

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

  const availableTags = useMemo(
    () =>
      Array.from(new Set(scenarios.flatMap((scenario) => scenario.tags)))
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
        .sort((left, right) => left.localeCompare(right)),
    [scenarios]
  );

  const visibleScenarios = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    let filtered = scenarios.filter((scenario) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        scenario.title.toLowerCase().includes(normalizedSearch) ||
        scenario.description.toLowerCase().includes(normalizedSearch);

      const matchesDifficulty =
        difficultyFilter === "all" || scenario.difficulty === difficultyFilter;

      const matchesTag =
        selectedTags.length === 0 || selectedTags.some((tag) => scenario.tags.includes(tag));

      return matchesSearch && matchesDifficulty && matchesTag;
    });

    if (sortBy === "timeAsc") {
      filtered = [...filtered].sort((left, right) => {
        if (left.estimatedTimeMinutes === right.estimatedTimeMinutes) {
          return left.title.localeCompare(right.title);
        }
        return left.estimatedTimeMinutes - right.estimatedTimeMinutes;
      });
    } else if (sortBy === "timeDesc") {
      filtered = [...filtered].sort((left, right) => {
        if (left.estimatedTimeMinutes === right.estimatedTimeMinutes) {
          return left.title.localeCompare(right.title);
        }
        return right.estimatedTimeMinutes - left.estimatedTimeMinutes;
      });
    } else if (sortBy === "difficulty") {
      const rank: Record<Scenario["difficulty"], number> = {
        beginner: 0,
        intermediate: 1,
        advanced: 2
      };

      filtered = [...filtered].sort((left, right) => {
        if (rank[left.difficulty] === rank[right.difficulty]) {
          return left.title.localeCompare(right.title);
        }
        return rank[left.difficulty] - rank[right.difficulty];
      });
    }

    return filtered;
  }, [difficultyFilter, scenarios, searchQuery, selectedTags, sortBy]);

  const toggleTag = (tag: string) => {
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag]
    );
  };

  const resetControls = () => {
    setSearchQuery("");
    setDifficultyFilter("all");
    setSelectedTags([]);
    setSortBy("default");
  };

  if (loading) {
    return (
      <section className="page dashboard-page" aria-busy="true" aria-live="polite">
        <header className="page-header">
          <h1>Scenario Catalog</h1>
          <p>Choose a scenario to start an isolated Git session.</p>
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
      <section className="page dashboard-page">
        <header className="page-header">
          <h1>Scenario Catalog</h1>
          <p>Choose a scenario to start an isolated Git session.</p>
        </header>
        <article className="panel state-surface">
          <p className="state-text error">{error}</p>
        </article>
      </section>
    );
  }

  return (
    <section className="page dashboard-page">
      <header className="page-header">
        <h1>Scenario Catalog</h1>
        <p>Choose a scenario to start an isolated Git session.</p>
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

      <section className="scenario-controls" aria-label="Scenario search, filter, and sort controls">
        <label className="control-search">
          <span className="control-search-icon" aria-hidden="true">
            <svg fill="none" viewBox="0 0 20 20">
              <path
                d="M8.5 2.5a6 6 0 104.2 10.3l3.5 3.5a1 1 0 001.4-1.4l-3.5-3.5A6 6 0 008.5 2.5zm0 2a4 4 0 110 8 4 4 0 010-8z"
                fill="currentColor"
              />
            </svg>
          </span>
          <input
            aria-label="Search scenarios"
            className="control-input"
            onChange={(event) => {
              setSearchQuery(event.target.value);
            }}
            placeholder="Search by title or description"
            type="text"
            value={searchQuery}
          />
        </label>

        <select
          aria-label="Filter by difficulty"
          className="control-select"
          onChange={(event) => {
            setDifficultyFilter(event.target.value as Scenario["difficulty"] | "all");
          }}
          value={difficultyFilter}
        >
          <option value="all">Difficulty: All</option>
          <option value="beginner">Difficulty: Beginner</option>
          <option value="intermediate">Difficulty: Intermediate</option>
          <option value="advanced">Difficulty: Advanced</option>
        </select>

        <details className="control-multiselect">
          <summary className="control-select control-select-summary">
            {selectedTags.length === 0 ? "Tags: All" : `Tags: ${selectedTags.length} selected`}
          </summary>
          <div className="control-menu">
            {availableTags.length === 0 ? (
              <p className="control-menu-empty">No tags available</p>
            ) : (
              <>
                <div className="control-menu-options">
                  {availableTags.map((tag) => (
                    <label className="control-option" key={tag}>
                      <input
                        checked={selectedTags.includes(tag)}
                        onChange={() => {
                          toggleTag(tag);
                        }}
                        type="checkbox"
                      />
                      <span>{tag}</span>
                    </label>
                  ))}
                </div>
                <button
                  className="control-clear"
                  onClick={() => {
                    setSelectedTags([]);
                  }}
                  type="button"
                >
                  Clear tags
                </button>
              </>
            )}
          </div>
        </details>

        <select
          aria-label="Sort scenarios"
          className="control-select"
          onChange={(event) => {
            setSortBy(event.target.value as "default" | "timeAsc" | "timeDesc" | "difficulty");
          }}
          value={sortBy}
        >
          <option value="default">Sort: Default</option>
          <option value="timeAsc">Sort: Time (Shortest to Longest)</option>
          <option value="timeDesc">Sort: Time (Longest to Shortest)</option>
          <option value="difficulty">Sort: Difficulty</option>
        </select>
      </section>

      <p className="state-text scenario-controls-meta">
        Showing {visibleScenarios.length} of {scenarios.length} scenarios
        {(searchQuery || difficultyFilter !== "all" || selectedTags.length > 0 || sortBy !== "default") && (
          <>
            {" "}
            -{" "}
            <button className="control-reset-link" onClick={resetControls} type="button">
              Reset controls
            </button>
          </>
        )}
      </p>

      {visibleScenarios.length === 0 && (
        <article className="panel state-surface">
          <p className="state-text">No scenarios match your current filters.</p>
        </article>
      )}

      <div className="dashboard-grid">
        {visibleScenarios.map((scenario) => (
          <article className="scenario-card" key={scenario.id}>
            <div className="scenario-card-top">
              <span className={`badge ${scenario.difficulty}`}>{scenario.difficulty}</span>
              <span className="mono state-text">~{scenario.estimatedTimeMinutes}m</span>
            </div>

            <h2 className="scenario-title">{scenario.title}</h2>
            <p className="scenario-description">{scenario.description}</p>

            <div className="scenario-tags">
              {scenario.tags.map((tag) => (
                <span className="scenario-tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>

            <Link
              className="button button-primary button-block scenario-card-cta"
              to={`/scenarios/${scenario.id}`}
            >
              Open Scenario
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
