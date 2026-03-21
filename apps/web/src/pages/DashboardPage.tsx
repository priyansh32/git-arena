import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Scenario, Session } from "@gitarena/shared";
import {
  Activity,
  ArrowDownWideNarrow,
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  Gauge,
  RotateCcw,
  Search,
  Tags,
  TerminalSquare
} from "lucide-react";

import { fetchActiveSession, fetchScenarios } from "../api/client";

type ScenarioSort = "default" | "timeAsc" | "timeDesc" | "difficulty";
type DashboardMenu = "difficulty" | "commonality" | "tags" | "sort";

function getRemainingLabel(expiresAt: string): string {
  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  if (remainingMs <= 0) {
    return "expired";
  }

  const totalMinutes = Math.ceil(remainingMs / 60000);
  return `${totalMinutes} min left`;
}

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

function getDifficultyLabel(difficulty: Scenario["difficulty"] | "all"): string {
  if (difficulty === "beginner") {
    return "Beginner";
  }
  if (difficulty === "intermediate") {
    return "Intermediate";
  }
  if (difficulty === "advanced") {
    return "Advanced";
  }
  return "All";
}

function getSortLabel(sortBy: ScenarioSort): string {
  if (sortBy === "timeAsc") {
    return "Time (Short to Long)";
  }
  if (sortBy === "timeDesc") {
    return "Time (Long to Short)";
  }
  if (sortBy === "difficulty") {
    return "Difficulty";
  }
  return "Default";
}

export function DashboardPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<Scenario["difficulty"] | "all">("all");
  const [commonalityFilter, setCommonalityFilter] = useState<Scenario["commonality"] | "all">(
    "all"
  );
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<ScenarioSort>("default");
  const [openMenu, setOpenMenu] = useState<DashboardMenu | null>(null);
  const controlsRef = useRef<HTMLElement | null>(null);

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

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!controlsRef.current?.contains(target)) {
        setOpenMenu(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
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

      const matchesCommonality =
        commonalityFilter === "all" || scenario.commonality === commonalityFilter;

      const matchesTag =
        selectedTags.length === 0 || selectedTags.some((tag) => scenario.tags.includes(tag));

      return matchesSearch && matchesDifficulty && matchesCommonality && matchesTag;
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
  }, [commonalityFilter, difficultyFilter, scenarios, searchQuery, selectedTags, sortBy]);

  const toggleTag = (tag: string) => {
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag]
    );
  };

  const toggleMenu = (menu: DashboardMenu) => {
    setOpenMenu((current) => (current === menu ? null : menu));
  };

  const closeMenus = () => {
    setOpenMenu(null);
  };

  const resetControls = () => {
    setSearchQuery("");
    setDifficultyFilter("all");
    setCommonalityFilter("all");
    setSelectedTags([]);
    setSortBy("default");
    setOpenMenu(null);
  };

  const difficultyLabel = getDifficultyLabel(difficultyFilter);
  const commonalityLabel =
    commonalityFilter === "all" ? "All" : getCommonalityLabel(commonalityFilter);
  const sortLabel = getSortLabel(sortBy);

  if (loading) {
    return (
      <section className="page dashboard-page" aria-busy="true" aria-live="polite">
        <header className="page-header">
          <h1 className="page-title">
            <Gauge aria-hidden="true" className="inline-icon title-icon" size={20} />
            Scenario Catalog
          </h1>
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
          <h1 className="page-title">
            <Gauge aria-hidden="true" className="inline-icon title-icon" size={20} />
            Scenario Catalog
          </h1>
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
        <h1 className="page-title">
          <Gauge aria-hidden="true" className="inline-icon title-icon" size={20} />
          Scenario Catalog
        </h1>
        <p>Choose a scenario to start an isolated Git session.</p>
      </header>

      {activeSession && (
        <article className="panel active-session-banner">
          <p className="active-session-banner-title">
            <Activity aria-hidden="true" className="inline-icon" size={14} />
            Active Session
          </p>
          <div className="active-session-row">
            <p>
              <span className="mono">{activeScenarioTitle}</span> - {getRemainingLabel(activeSession.expiresAt)}
            </p>
            <Link className="button button-primary" to={`/sessions/${activeSession.id}`}>
              <TerminalSquare aria-hidden="true" className="inline-icon" size={15} />
              Resume Workspace
            </Link>
          </div>
        </article>
      )}

      <section
        className="scenario-controls"
        aria-label="Scenario search, filter, and sort controls"
        ref={controlsRef}
      >
        <label className="control-search">
          <span className="control-search-icon" aria-hidden="true">
            <Search aria-hidden="true" size={16} />
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

        <div className="control-group">
          <div className="control-dropdown">
            <button
              aria-expanded={openMenu === "difficulty"}
              aria-haspopup="listbox"
              className="control-trigger"
              onClick={() => {
                toggleMenu("difficulty");
              }}
              type="button"
            >
              <span className="control-trigger-label">
                <Gauge aria-hidden="true" className="inline-icon" size={15} />
                Difficulty: {difficultyLabel}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={`inline-icon control-chevron${openMenu === "difficulty" ? " open" : ""}`}
                size={14}
              />
            </button>
            {openMenu === "difficulty" && (
              <div aria-label="Difficulty options" className="control-menu" role="listbox">
                {[
                  { label: "All", value: "all" as const },
                  { label: "Beginner", value: "beginner" as const },
                  { label: "Intermediate", value: "intermediate" as const },
                  { label: "Advanced", value: "advanced" as const }
                ].map((option) => (
                  <button
                    className={`control-item${difficultyFilter === option.value ? " active" : ""}`}
                    key={option.value}
                    onClick={() => {
                      setDifficultyFilter(option.value);
                      closeMenus();
                    }}
                    role="option"
                    type="button"
                  >
                    <span className="control-item-check" aria-hidden="true">
                      {difficultyFilter === option.value && <Check className="inline-icon" size={13} />}
                    </span>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="control-dropdown">
            <button
              aria-expanded={openMenu === "commonality"}
              aria-haspopup="listbox"
              className="control-trigger"
              onClick={() => {
                toggleMenu("commonality");
              }}
              type="button"
            >
              <span className="control-trigger-label">
                <Activity aria-hidden="true" className="inline-icon" size={15} />
                Commonality: {commonalityLabel}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={`inline-icon control-chevron${openMenu === "commonality" ? " open" : ""}`}
                size={14}
              />
            </button>
            {openMenu === "commonality" && (
              <div aria-label="Commonality options" className="control-menu" role="listbox">
                {[
                  { label: "All", value: "all" as const },
                  { label: "Very Common", value: "very_common" as const },
                  { label: "Common", value: "common" as const },
                  { label: "Occasional", value: "occasional" as const },
                  { label: "Rare", value: "rare" as const }
                ].map((option) => (
                  <button
                    className={`control-item${commonalityFilter === option.value ? " active" : ""}`}
                    key={option.value}
                    onClick={() => {
                      setCommonalityFilter(option.value);
                      closeMenus();
                    }}
                    role="option"
                    type="button"
                  >
                    <span className="control-item-check" aria-hidden="true">
                      {commonalityFilter === option.value && <Check className="inline-icon" size={13} />}
                    </span>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="control-dropdown">
            <button
              aria-expanded={openMenu === "tags"}
              aria-haspopup="listbox"
              className="control-trigger"
              onClick={() => {
                toggleMenu("tags");
              }}
              type="button"
            >
              <span className="control-trigger-label">
                <Tags aria-hidden="true" className="inline-icon" size={15} />
                {selectedTags.length === 0 ? "Tags: All" : `Tags: ${selectedTags.length}`}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={`inline-icon control-chevron${openMenu === "tags" ? " open" : ""}`}
                size={14}
              />
            </button>
            {openMenu === "tags" && (
              <div aria-label="Tag options" className="control-menu control-menu-tags" role="listbox">
                {availableTags.length === 0 ? (
                  <p className="control-menu-empty">No tags available</p>
                ) : (
                  <>
                    <div className="control-menu-options">
                      {availableTags.map((tag) => (
                        <button
                          className={`control-item${selectedTags.includes(tag) ? " active" : ""}`}
                          key={tag}
                          onClick={() => {
                            toggleTag(tag);
                          }}
                          role="option"
                          type="button"
                        >
                          <span className="control-item-check" aria-hidden="true">
                            {selectedTags.includes(tag) && <Check className="inline-icon" size={13} />}
                          </span>
                          <span>{tag}</span>
                        </button>
                      ))}
                    </div>
                    <div className="control-menu-actions">
                      <button
                        className="control-clear"
                        onClick={() => {
                          setSelectedTags([]);
                        }}
                        type="button"
                      >
                        <RotateCcw aria-hidden="true" className="inline-icon" size={14} />
                        Clear tags
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="control-dropdown">
            <button
              aria-expanded={openMenu === "sort"}
              aria-haspopup="listbox"
              className="control-trigger"
              onClick={() => {
                toggleMenu("sort");
              }}
              type="button"
            >
              <span className="control-trigger-label">
                <ArrowDownWideNarrow aria-hidden="true" className="inline-icon" size={15} />
                Sort: {sortLabel}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={`inline-icon control-chevron${openMenu === "sort" ? " open" : ""}`}
                size={14}
              />
            </button>
            {openMenu === "sort" && (
              <div aria-label="Sort options" className="control-menu" role="listbox">
                {[
                  { label: "Default", value: "default" as const },
                  { label: "Time (Short to Long)", value: "timeAsc" as const },
                  { label: "Time (Long to Short)", value: "timeDesc" as const },
                  { label: "Difficulty", value: "difficulty" as const }
                ].map((option) => (
                  <button
                    className={`control-item${sortBy === option.value ? " active" : ""}`}
                    key={option.value}
                    onClick={() => {
                      setSortBy(option.value);
                      closeMenus();
                    }}
                    role="option"
                    type="button"
                  >
                    <span className="control-item-check" aria-hidden="true">
                      {sortBy === option.value && <Check className="inline-icon" size={13} />}
                    </span>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <p className="state-text scenario-controls-meta">
        Showing {visibleScenarios.length} of {scenarios.length} scenarios
        {(searchQuery ||
          difficultyFilter !== "all" ||
          commonalityFilter !== "all" ||
          selectedTags.length > 0 ||
          sortBy !== "default") && (
          <>
            {" "}
            -{" "}
            <button className="control-reset-link" onClick={resetControls} type="button">
              <RotateCcw aria-hidden="true" className="inline-icon" size={13} />
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
              <div className="scenario-card-meta">
                <span className={`badge ${scenario.difficulty}`}>{scenario.difficulty}</span>
                <span className={`commonality-pill ${scenario.commonality}`}>
                  {getCommonalityLabel(scenario.commonality)}
                </span>
              </div>
              <span className="mono state-text scenario-time-chip">
                <Clock3 aria-hidden="true" className="inline-icon" size={13} />
                ~{scenario.estimatedTimeMinutes}m
              </span>
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
              <ArrowRight aria-hidden="true" className="inline-icon" size={15} />
              Open Scenario
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
