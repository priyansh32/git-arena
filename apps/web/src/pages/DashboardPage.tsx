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
  if (commonality === "very_common") return "Very Common";
  if (commonality === "common") return "Common";
  if (commonality === "occasional") return "Occasional";
  if (commonality === "rare") return "Rare";
  return commonality;
}

function getDifficultyLabel(difficulty: Scenario["difficulty"] | "all"): string {
  if (difficulty === "beginner") return "Beginner";
  if (difficulty === "intermediate") return "Intermediate";
  if (difficulty === "advanced") return "Advanced";
  return "All";
}

function getSortLabel(sortBy: ScenarioSort): string {
  if (sortBy === "timeAsc") return "Time (Short to Long)";
  if (sortBy === "timeDesc") return "Time (Long to Short)";
  if (sortBy === "difficulty") return "Difficulty";
  return "Default";
}

export function DashboardPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<Scenario["difficulty"] | "all">("all");
  const [commonalityFilter, setCommonalityFilter] = useState<Scenario["commonality"] | "all">("all");
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
      <section className="flex flex-col gap-6 w-full" aria-busy="true" aria-live="polite">
        <header className="flex flex-col gap-2">
          <h1 className="m-0 flex items-center gap-2 text-[clamp(1.5rem,4vw,2rem)] font-bold tracking-tight leading-[1.2]">
            <Gauge aria-hidden="true" className="shrink-0 text-accent-primary" size={20} />
            Scenario Catalog
          </h1>
          <p className="m-0 text-text-readable text-lg max-w-[64ch]">Choose a scenario to start an isolated Git session.</p>
        </header>
        <div className="skeleton min-h-[120px]" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="skeleton min-h-[280px]" key={index} />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="flex flex-col gap-6 w-full">
        <header className="flex flex-col gap-2">
          <h1 className="m-0 flex items-center gap-2 text-[clamp(1.5rem,4vw,2rem)] font-bold tracking-tight leading-[1.2]">
            <Gauge aria-hidden="true" className="shrink-0 text-accent-primary" size={20} />
            Scenario Catalog
          </h1>
          <p className="m-0 text-text-readable text-lg max-w-[64ch]">Choose a scenario to start an isolated Git session.</p>
        </header>
        <article className="flex flex-col items-center justify-center gap-4 min-h-[120px] p-8 text-center bg-bg-surface border border-border-subtle rounded-xl">
          <p className="m-0 text-status-fail">{error}</p>
        </article>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6 w-full pb-12">
      <header className="flex flex-col gap-2">
        <h1 className="m-0 flex items-center gap-2 text-[clamp(1.5rem,4vw,2rem)] font-bold tracking-tight leading-[1.2]">
          <Gauge aria-hidden="true" className="shrink-0 text-accent-primary" size={20} />
          Scenario Catalog
        </h1>
        <p className="m-0 text-text-readable text-lg max-w-[64ch]">Choose a scenario to start an isolated Git session.</p>
      </header>

      {activeSession && (
        <article className="flex flex-col gap-3 p-4 border border-accent-primary bg-accent-primary/5 rounded-xl">
          <p className="m-0 flex items-center gap-2 text-accent-primary font-mono text-xs font-bold uppercase tracking-wider">
            <Activity aria-hidden="true" className="shrink-0" size={14} />
            Active Session
          </p>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <p className="m-0 text-text-primary text-sm flex items-center flex-wrap gap-2">
              <span className="font-mono bg-bg-surface-soft px-2 py-1 rounded border border-border-strong text-accent-primary">{activeScenarioTitle}</span> 
              <span className="text-text-secondary font-mono">{getRemainingLabel(activeSession.expiresAt)}</span>
            </p>
            <Link className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2 bg-accent-primary text-bg-base hover:bg-accent-hover rounded-md text-sm font-bold transition-colors min-h-[40px] shrink-0 whitespace-nowrap" to={`/sessions/${activeSession.id}`}>
              <TerminalSquare aria-hidden="true" className="shrink-0" size={15} />
              Resume Workspace
            </Link>
          </div>
        </article>
      )}

      <section
        className="flex flex-col md:flex-row gap-4 p-4 bg-bg-surface/60 border border-border-subtle rounded-xl backdrop-blur-md shadow-sm"
        aria-label="Scenario search, filter, and sort controls"
        ref={controlsRef}
      >
        <label className="relative flex-1 min-w-0">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" aria-hidden="true">
            <Search aria-hidden="true" size={16} />
          </span>
          <input
            aria-label="Search scenarios"
            className="w-full min-h-[40px] pl-10 pr-4 bg-bg-base border border-border-strong rounded-lg text-text-primary text-sm transition-colors focus:outline-none focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 placeholder:text-text-secondary"
            onChange={(event) => {
              setSearchQuery(event.target.value);
            }}
            placeholder="Search by title or description"
            type="text"
            value={searchQuery}
          />
        </label>

        <div className="flex flex-nowrap md:flex-wrap overflow-x-auto md:overflow-x-visible gap-2 pb-1 md:pb-0 scrollbar-hide shrink-0 snap-x snap-mandatory">
          <div className="relative min-w-fit shrink-0 snap-start">
            <button
              aria-expanded={openMenu === "difficulty"}
              aria-haspopup="listbox"
              className="w-full flex items-center justify-between gap-2 px-3 min-h-[40px] bg-bg-base border border-border-strong rounded-lg font-mono text-[13px] text-text-primary whitespace-nowrap transition-colors hover:bg-bg-surface-hover hover:border-accent-primary/50 focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
              onClick={() => {
                toggleMenu("difficulty");
              }}
              type="button"
            >
              <span className="flex items-center gap-2">
                <Gauge aria-hidden="true" className="shrink-0 text-text-secondary" size={15} />
                Difficulty: {difficultyLabel}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={`shrink-0 text-text-secondary transition-transform ${openMenu === "difficulty" ? "rotate-180" : ""}`}
                size={14}
              />
            </button>
            {openMenu === "difficulty" && (
              <div aria-label="Difficulty options" className="absolute top-[calc(100%+4px)] left-0 md:right-0 z-50 min-w-[200px] max-h-[300px] overflow-y-auto bg-bg-surface-soft border border-border-strong rounded-lg p-1.5 flex flex-col gap-1 shadow-lg" role="listbox">
                {[
                  { label: "All", value: "all" as const },
                  { label: "Beginner", value: "beginner" as const },
                  { label: "Intermediate", value: "intermediate" as const },
                  { label: "Advanced", value: "advanced" as const }
                ].map((option) => (
                  <button
                    className={`flex items-center gap-2 w-full p-2 rounded-md font-mono text-[13px] text-left transition-colors hover:bg-bg-surface-hover ${difficultyFilter === option.value ? "bg-accent-primary/15 text-accent-primary" : "text-text-primary"}`}
                    key={option.value}
                    onClick={() => {
                      setDifficultyFilter(option.value);
                      closeMenus();
                    }}
                    role="option"
                    type="button"
                  >
                    <span className="w-4 flex items-center justify-center shrink-0" aria-hidden="true">
                      {difficultyFilter === option.value && <Check className="shrink-0" size={13} />}
                    </span>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative min-w-fit shrink-0 snap-start">
            <button
              aria-expanded={openMenu === "commonality"}
              aria-haspopup="listbox"
              className="w-full flex items-center justify-between gap-2 px-3 min-h-[40px] bg-bg-base border border-border-strong rounded-lg font-mono text-[13px] text-text-primary whitespace-nowrap transition-colors hover:bg-bg-surface-hover hover:border-accent-primary/50 focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
              onClick={() => {
                toggleMenu("commonality");
              }}
              type="button"
            >
              <span className="flex items-center gap-2">
                <Activity aria-hidden="true" className="shrink-0 text-text-secondary" size={15} />
                Commonality: {commonalityLabel}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={`shrink-0 text-text-secondary transition-transform ${openMenu === "commonality" ? "rotate-180" : ""}`}
                size={14}
              />
            </button>
            {openMenu === "commonality" && (
              <div aria-label="Commonality options" className="absolute top-[calc(100%+4px)] left-0 md:right-0 z-50 min-w-[200px] max-h-[300px] overflow-y-auto bg-bg-surface-soft border border-border-strong rounded-lg p-1.5 flex flex-col gap-1 shadow-lg" role="listbox">
                {[
                  { label: "All", value: "all" as const },
                  { label: "Very Common", value: "very_common" as const },
                  { label: "Common", value: "common" as const },
                  { label: "Occasional", value: "occasional" as const },
                  { label: "Rare", value: "rare" as const }
                ].map((option) => (
                  <button
                    className={`flex items-center gap-2 w-full p-2 rounded-md font-mono text-[13px] text-left transition-colors hover:bg-bg-surface-hover ${commonalityFilter === option.value ? "bg-accent-primary/15 text-accent-primary" : "text-text-primary"}`}
                    key={option.value}
                    onClick={() => {
                      setCommonalityFilter(option.value);
                      closeMenus();
                    }}
                    role="option"
                    type="button"
                  >
                    <span className="w-4 flex items-center justify-center shrink-0" aria-hidden="true">
                      {commonalityFilter === option.value && <Check className="shrink-0" size={13} />}
                    </span>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative min-w-fit shrink-0 snap-start">
            <button
              aria-expanded={openMenu === "tags"}
              aria-haspopup="listbox"
              className="w-full flex items-center justify-between gap-2 px-3 min-h-[40px] bg-bg-base border border-border-strong rounded-lg font-mono text-[13px] text-text-primary whitespace-nowrap transition-colors hover:bg-bg-surface-hover hover:border-accent-primary/50 focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
              onClick={() => {
                toggleMenu("tags");
              }}
              type="button"
            >
              <span className="flex items-center gap-2">
                <Tags aria-hidden="true" className="shrink-0 text-text-secondary" size={15} />
                {selectedTags.length === 0 ? "Tags: All" : `Tags: ${selectedTags.length}`}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={`shrink-0 text-text-secondary transition-transform ${openMenu === "tags" ? "rotate-180" : ""}`}
                size={14}
              />
            </button>
            {openMenu === "tags" && (
              <div aria-label="Tag options" className="absolute top-[calc(100%+4px)] left-0 md:right-0 z-50 min-w-[240px] max-h-[300px] overflow-y-auto bg-bg-surface-soft border border-border-strong rounded-lg p-1.5 flex flex-col gap-1 shadow-lg" role="listbox">
                {availableTags.length === 0 ? (
                  <p className="m-0 text-text-secondary text-[13px] font-mono p-2">No tags available</p>
                ) : (
                  <>
                    <div className="flex flex-col gap-1">
                      {availableTags.map((tag) => (
                        <button
                          className={`flex items-center gap-2 w-full p-2 rounded-md font-mono text-[13px] text-left transition-colors hover:bg-bg-surface-hover ${selectedTags.includes(tag) ? "bg-accent-primary/15 text-accent-primary" : "text-text-primary"}`}
                          key={tag}
                          onClick={() => {
                            toggleTag(tag);
                          }}
                          role="option"
                          type="button"
                        >
                          <span className="w-4 flex items-center justify-center shrink-0" aria-hidden="true">
                            {selectedTags.includes(tag) && <Check className="shrink-0" size={13} />}
                          </span>
                          <span>{tag}</span>
                        </button>
                      ))}
                    </div>
                    <div className="mt-1 pt-1 border-t border-border-strong">
                      <button
                        className="flex items-center justify-center w-full gap-2 p-1.5 text-status-fail hover:bg-status-fail-bg/50 rounded text-xs font-mono transition-colors"
                        onClick={() => {
                          setSelectedTags([]);
                        }}
                        type="button"
                      >
                        <RotateCcw aria-hidden="true" className="shrink-0" size={12} />
                        Clear tags
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="relative min-w-fit shrink-0 snap-start">
            <button
              aria-expanded={openMenu === "sort"}
              aria-haspopup="listbox"
              className="w-full flex items-center justify-between gap-2 px-3 min-h-[40px] bg-bg-base border border-border-strong rounded-lg font-mono text-[13px] text-text-primary whitespace-nowrap transition-colors hover:bg-bg-surface-hover hover:border-accent-primary/50 focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
              onClick={() => {
                toggleMenu("sort");
              }}
              type="button"
            >
              <span className="flex items-center gap-2">
                <ArrowDownWideNarrow aria-hidden="true" className="shrink-0 text-text-secondary" size={15} />
                Sort: {sortLabel}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={`shrink-0 text-text-secondary transition-transform ${openMenu === "sort" ? "rotate-180" : ""}`}
                size={14}
              />
            </button>
            {openMenu === "sort" && (
              <div aria-label="Sort options" className="absolute top-[calc(100%+4px)] left-0 md:right-0 z-50 min-w-[220px] max-h-[300px] overflow-y-auto bg-bg-surface-soft border border-border-strong rounded-lg p-1.5 flex flex-col gap-1 shadow-lg" role="listbox">
                {[
                  { label: "Default", value: "default" as const },
                  { label: "Time (Short to Long)", value: "timeAsc" as const },
                  { label: "Time (Long to Short)", value: "timeDesc" as const },
                  { label: "Difficulty", value: "difficulty" as const }
                ].map((option) => (
                  <button
                    className={`flex items-center gap-2 w-full p-2 rounded-md font-mono text-[13px] text-left transition-colors hover:bg-bg-surface-hover ${sortBy === option.value ? "bg-accent-primary/15 text-accent-primary" : "text-text-primary"}`}
                    key={option.value}
                    onClick={() => {
                      setSortBy(option.value);
                      closeMenus();
                    }}
                    role="option"
                    type="button"
                  >
                    <span className="w-4 flex items-center justify-center shrink-0" aria-hidden="true">
                      {sortBy === option.value && <Check className="shrink-0" size={13} />}
                    </span>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between text-sm text-text-secondary">
        <p className="m-0">
          Showing {visibleScenarios.length} of {scenarios.length} scenarios
        </p>
        {(searchQuery || difficultyFilter !== "all" || commonalityFilter !== "all" || selectedTags.length > 0 || sortBy !== "default") && (
          <button className="inline-flex items-center gap-1.5 text-accent-primary font-mono text-xs hover:underline transition-colors" onClick={resetControls} type="button">
            <RotateCcw aria-hidden="true" className="shrink-0" size={12} />
            Reset filters
          </button>
        )}
      </div>

      {visibleScenarios.length === 0 && (
        <article className="flex flex-col items-center justify-center gap-4 min-h-[120px] p-8 text-center bg-bg-surface border border-border-subtle rounded-xl">
          <p className="m-0 text-text-secondary">No scenarios match your current filters.</p>
        </article>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
        {visibleScenarios.map((scenario) => (
          <article className="flex flex-col bg-bg-surface border border-border-subtle rounded-xl p-6 transition-all hover:border-border-strong hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/50 h-full group" key={scenario.id}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex flex-wrap gap-2">
                <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider border leading-none ${scenario.difficulty === 'beginner' ? 'text-status-pass bg-status-pass-bg border-status-pass-border' : scenario.difficulty === 'intermediate' ? 'text-status-warn bg-status-warn-bg border-status-warn-border' : 'text-status-fail bg-status-fail-bg border-status-fail-border'}`}>
                  {getDifficultyLabel(scenario.difficulty)}
                </span>
                <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider border leading-none ${scenario.commonality === 'very_common' ? 'text-[#86efac] bg-[#22c55e29] border-[#22c55e66]' : scenario.commonality === 'common' ? 'text-[#67e8f9] bg-[#06b6d424] border-[#06b6d46b]' : scenario.commonality === 'occasional' ? 'text-[#fdba74] bg-[#f9731629] border-[#f973166b]' : 'text-[#c4b5fd] bg-[#8b5cf62b] border-[#8b5cf673]'}`}>
                  {getCommonalityLabel(scenario.commonality)}
                </span>
              </div>
              <span className="flex items-center gap-1.5 font-mono text-xs text-text-secondary whitespace-nowrap shrink-0">
                <Clock3 aria-hidden="true" className="shrink-0" size={12} />
                ~{scenario.estimatedTimeMinutes}m
              </span>
            </div>

            <h2 className="m-0 mb-2 text-xl font-bold leading-tight line-clamp-2 text-text-primary group-hover:text-accent-primary transition-colors">{scenario.title}</h2>
            <p className="m-0 mb-6 text-sm text-text-readable leading-relaxed line-clamp-3 flex-1">{scenario.description}</p>

            <div className="flex flex-wrap gap-1.5 mb-6">
              {scenario.tags.map((tag) => (
                <span className="bg-bg-surface-soft border border-border-strong text-text-primary text-[10px] font-mono px-2 py-0.5 rounded-full" key={tag}>
                  {tag}
                </span>
              ))}
            </div>

            <Link
              className="mt-auto inline-flex w-full items-center justify-center gap-2 px-4 py-2 bg-accent-primary/10 border border-accent-primary/30 text-accent-primary group-hover:bg-accent-primary group-hover:text-bg-base group-hover:border-accent-primary rounded-md text-sm font-bold min-h-[40px] transition-colors shadow-sm"
              to={`/scenarios/${scenario.id}`}
            >
              Open Scenario
              <ArrowRight aria-hidden="true" className="shrink-0" size={15} />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
