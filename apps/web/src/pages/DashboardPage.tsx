import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Attempt, Scenario, Session } from "@gitarena/shared";
import {
  Activity,
  ArrowDownWideNarrow,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Gauge,
  History,
  LayoutDashboard,
  PlayCircle,
  RotateCcw,
  Search,
  Tags,
  TerminalSquare,
  Trophy
} from "lucide-react";

import { fetchActiveSession, fetchScenarios, fetchUserHistory } from "../api/client";

type DashboardTab = "overview" | "solved" | "inProgress" | "activity";
type ScenarioSort = "default" | "timeAsc" | "timeDesc" | "difficulty";
type SolvedSort = "recent" | "az" | "attempts" | "fastest" | "difficulty";
type CompletionFilter = "all" | "solved" | "unsolved";
type DashboardMenu = "difficulty" | "commonality" | "tags" | "sort";

interface SolvedScenarioEntry {
  scenario: Scenario;
  firstSolvedAt: string;
  lastPassedAt: string;
  attemptsBeforePass: number;
  totalAttempts: number;
  lastAttemptAt: string;
  lastAttemptPassed: boolean;
  latestAttemptSessionId: string;
}

interface InProgressScenarioEntry {
  scenario: Scenario;
  totalAttempts: number;
  lastAttemptAt: string;
  lastAttemptPassed: boolean;
}

interface DashboardPageProps {
  mode?: "dashboard" | "library";
}

const difficultyOptions = [
  { label: "All", value: "all" as const },
  { label: "Beginner", value: "beginner" as const },
  { label: "Intermediate", value: "intermediate" as const },
  { label: "Advanced", value: "advanced" as const }
];

const commonalityOptions = [
  { label: "All", value: "all" as const },
  { label: "Very Common", value: "very_common" as const },
  { label: "Common", value: "common" as const },
  { label: "Occasional", value: "occasional" as const },
  { label: "Rare", value: "rare" as const }
];

const catalogSortOptions = [
  { label: "Default", value: "default" as const },
  { label: "Time (Short to Long)", value: "timeAsc" as const },
  { label: "Time (Long to Short)", value: "timeDesc" as const },
  { label: "Difficulty", value: "difficulty" as const }
];

const solvedSortOptions = [
  { label: "Recently Solved", value: "recent" as const },
  { label: "A-Z", value: "az" as const },
  { label: "Most Attempts", value: "attempts" as const },
  { label: "Fastest Solve", value: "fastest" as const },
  { label: "Difficulty", value: "difficulty" as const }
];

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

function getCatalogSortLabel(sortBy: ScenarioSort): string {
  if (sortBy === "timeAsc") return "Time (Short to Long)";
  if (sortBy === "timeDesc") return "Time (Long to Short)";
  if (sortBy === "difficulty") return "Difficulty";
  return "Default";
}

function getSolvedSortLabel(sortBy: SolvedSort): string {
  if (sortBy === "recent") return "Recently Solved";
  if (sortBy === "az") return "A-Z";
  if (sortBy === "attempts") return "Most Attempts";
  if (sortBy === "fastest") return "Fastest Solve";
  return "Difficulty";
}

function formatDateLabel(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatDateTimeLabel(isoDate: string): string {
  return new Date(isoDate).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function difficultyBadgeClass(difficulty: Scenario["difficulty"]): string {
  if (difficulty === "beginner") {
    return "text-status-pass bg-status-pass-bg border-status-pass-border";
  }

  if (difficulty === "intermediate") {
    return "text-status-warn bg-status-warn-bg border-status-warn-border";
  }

  return "text-status-fail bg-status-fail-bg border-status-fail-border";
}

function commonalityBadgeClass(commonality: Scenario["commonality"]): string {
  if (commonality === "very_common") {
    return "text-[#86efac] bg-[#22c55e29] border-[#22c55e66]";
  }

  if (commonality === "common") {
    return "text-[#67e8f9] bg-[#06b6d424] border-[#06b6d46b]";
  }

  if (commonality === "occasional") {
    return "text-[#fdba74] bg-[#f9731629] border-[#f973166b]";
  }

  return "text-[#c4b5fd] bg-[#8b5cf62b] border-[#8b5cf673]";
}

function compareCatalogScenarios(left: Scenario, right: Scenario, sortBy: ScenarioSort): number {
  if (sortBy === "timeAsc") {
    if (left.estimatedTimeMinutes === right.estimatedTimeMinutes) {
      return left.title.localeCompare(right.title);
    }

    return left.estimatedTimeMinutes - right.estimatedTimeMinutes;
  }

  if (sortBy === "timeDesc") {
    if (left.estimatedTimeMinutes === right.estimatedTimeMinutes) {
      return left.title.localeCompare(right.title);
    }

    return right.estimatedTimeMinutes - left.estimatedTimeMinutes;
  }

  if (sortBy === "difficulty") {
    const rank: Record<Scenario["difficulty"], number> = {
      beginner: 0,
      intermediate: 1,
      advanced: 2
    };

    if (rank[left.difficulty] === rank[right.difficulty]) {
      return left.title.localeCompare(right.title);
    }

    return rank[left.difficulty] - rank[right.difficulty];
  }

  return left.title.localeCompare(right.title);
}

function buildAttemptsByScenario(attempts: Attempt[]): Map<string, Attempt[]> {
  const grouped = new Map<string, Attempt[]>();

  for (const attempt of attempts) {
    const list = grouped.get(attempt.scenarioId);
    if (list) {
      list.push(attempt);
      continue;
    }

    grouped.set(attempt.scenarioId, [attempt]);
  }

  for (const list of grouped.values()) {
    list.sort(
      (left, right) =>
        new Date(right.evaluatedAt).getTime() - new Date(left.evaluatedAt).getTime()
    );
  }

  return grouped;
}

export function DashboardPage({ mode = "dashboard" }: DashboardPageProps) {
  const isLibraryMode = mode === "library";
  const HeaderIcon = isLibraryMode ? BookOpen : LayoutDashboard;

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>(
    isLibraryMode ? "overview" : "solved"
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<Scenario["difficulty"] | "all">("all");
  const [commonalityFilter, setCommonalityFilter] = useState<Scenario["commonality"] | "all">("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [catalogSort, setCatalogSort] = useState<ScenarioSort>("default");
  const [solvedSort, setSolvedSort] = useState<SolvedSort>("recent");
  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>("all");
  const [openMenu, setOpenMenu] = useState<DashboardMenu | null>(null);
  const controlsRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const [scenarioData, activeSessionData, historyData] = await Promise.all([
          fetchScenarios(),
          fetchActiveSession(),
          fetchUserHistory()
        ]);

        setScenarios(scenarioData);
        setActiveSession(activeSessionData);
        setAttempts(historyData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard data");
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

  useEffect(() => {
    setActiveTab(isLibraryMode ? "overview" : "solved");
  }, [isLibraryMode]);

  const attemptsByScenario = useMemo(() => buildAttemptsByScenario(attempts), [attempts]);

  const solvedEntries = useMemo<SolvedScenarioEntry[]>(() => {
    const entries: SolvedScenarioEntry[] = [];

    for (const scenario of scenarios) {
      const scenarioAttempts = attemptsByScenario.get(scenario.id) ?? [];
      if (scenarioAttempts.length === 0) {
        continue;
      }

      const hasPass = scenarioAttempts.some((attempt) => attempt.passed);
      if (!hasPass) {
        continue;
      }

      const ascendingAttempts = [...scenarioAttempts].reverse();
      const firstPassIndex = ascendingAttempts.findIndex((attempt) => attempt.passed);
      if (firstPassIndex < 0) {
        continue;
      }

      const firstPassAttempt = ascendingAttempts[firstPassIndex];
      const latestPassAttempt = scenarioAttempts.find((attempt) => attempt.passed);
      const latestAttempt = scenarioAttempts[0];

      if (!latestPassAttempt || !latestAttempt) {
        continue;
      }

      entries.push({
        scenario,
        firstSolvedAt: firstPassAttempt.evaluatedAt,
        lastPassedAt: latestPassAttempt.evaluatedAt,
        attemptsBeforePass: firstPassIndex + 1,
        totalAttempts: scenarioAttempts.length,
        lastAttemptAt: latestAttempt.evaluatedAt,
        lastAttemptPassed: latestAttempt.passed,
        latestAttemptSessionId: latestAttempt.sessionId
      });
    }

    return entries;
  }, [attemptsByScenario, scenarios]);

  const inProgressEntries = useMemo<InProgressScenarioEntry[]>(() => {
    const entries: InProgressScenarioEntry[] = [];

    for (const scenario of scenarios) {
      const scenarioAttempts = attemptsByScenario.get(scenario.id) ?? [];
      if (scenarioAttempts.length === 0) {
        continue;
      }

      if (scenarioAttempts.some((attempt) => attempt.passed)) {
        continue;
      }

      const latestAttempt = scenarioAttempts[0];
      entries.push({
        scenario,
        totalAttempts: scenarioAttempts.length,
        lastAttemptAt: latestAttempt.evaluatedAt,
        lastAttemptPassed: latestAttempt.passed
      });
    }

    entries.sort(
      (left, right) =>
        new Date(right.lastAttemptAt).getTime() - new Date(left.lastAttemptAt).getTime()
    );

    return entries;
  }, [attemptsByScenario, scenarios]);

  const solvedScenarioIds = useMemo(
    () => new Set(solvedEntries.map((entry) => entry.scenario.id)),
    [solvedEntries]
  );

  const scenarioTitleById = useMemo(
    () => new Map(scenarios.map((scenario) => [scenario.id, scenario.title])),
    [scenarios]
  );

  const availableTags = useMemo(
    () =>
      Array.from(new Set(scenarios.flatMap((scenario) => scenario.tags)))
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
        .sort((left, right) => left.localeCompare(right)),
    [scenarios]
  );

  const matchesScenarioFilters = (scenario: Scenario): boolean => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

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

    const matchesCompletion =
      !isLibraryMode ||
      completionFilter === "all" ||
      (completionFilter === "solved"
        ? solvedScenarioIds.has(scenario.id)
        : !solvedScenarioIds.has(scenario.id));

    return (
      matchesSearch &&
      matchesDifficulty &&
      matchesCommonality &&
      matchesTag &&
      matchesCompletion
    );
  };

  const visibleOverviewScenarios = useMemo(() => {
    const filtered = scenarios.filter(matchesScenarioFilters);
    return [...filtered].sort((left, right) => compareCatalogScenarios(left, right, catalogSort));
  }, [
    catalogSort,
    commonalityFilter,
    completionFilter,
    difficultyFilter,
    isLibraryMode,
    scenarios,
    searchQuery,
    selectedTags,
    solvedScenarioIds
  ]);

  const visibleSolvedEntries = useMemo(() => {
    const filtered = solvedEntries.filter((entry) => matchesScenarioFilters(entry.scenario));

    const sorted = [...filtered];
    sorted.sort((left, right) => {
      if (solvedSort === "recent") {
        return (
          new Date(right.lastPassedAt).getTime() - new Date(left.lastPassedAt).getTime()
        );
      }

      if (solvedSort === "az") {
        return left.scenario.title.localeCompare(right.scenario.title);
      }

      if (solvedSort === "attempts") {
        if (left.totalAttempts === right.totalAttempts) {
          return left.scenario.title.localeCompare(right.scenario.title);
        }

        return right.totalAttempts - left.totalAttempts;
      }

      if (solvedSort === "fastest") {
        if (left.attemptsBeforePass === right.attemptsBeforePass) {
          return left.scenario.title.localeCompare(right.scenario.title);
        }

        return left.attemptsBeforePass - right.attemptsBeforePass;
      }

      return compareCatalogScenarios(left.scenario, right.scenario, "difficulty");
    });

    return sorted;
  }, [
    commonalityFilter,
    completionFilter,
    difficultyFilter,
    isLibraryMode,
    searchQuery,
    selectedTags,
    solvedEntries,
    solvedScenarioIds,
    solvedSort
  ]);

  const visibleInProgressEntries = useMemo(() => {
    const filtered = inProgressEntries.filter((entry) => matchesScenarioFilters(entry.scenario));

    if (catalogSort === "default") {
      return filtered;
    }

    return [...filtered].sort((left, right) =>
      compareCatalogScenarios(left.scenario, right.scenario, catalogSort)
    );
  }, [
    catalogSort,
    commonalityFilter,
    completionFilter,
    difficultyFilter,
    inProgressEntries,
    isLibraryMode,
    searchQuery,
    selectedTags,
    solvedScenarioIds
  ]);

  const recentAttempts = useMemo(
    () =>
      [...attempts].sort(
        (left, right) =>
          new Date(right.evaluatedAt).getTime() - new Date(left.evaluatedAt).getTime()
      ),
    [attempts]
  );

  const recommendedScenarios = useMemo(() => {
    const solvedTagWeights = new Map<string, number>();
    for (const entry of solvedEntries) {
      for (const tag of entry.scenario.tags) {
        solvedTagWeights.set(tag, (solvedTagWeights.get(tag) ?? 0) + 1);
      }
    }

    const unsolvedScenarios = scenarios.filter((scenario) => !solvedScenarioIds.has(scenario.id));

    return [...unsolvedScenarios]
      .sort((left, right) => {
        const leftScore = left.tags.reduce((score, tag) => score + (solvedTagWeights.get(tag) ?? 0), 0);
        const rightScore = right.tags.reduce((score, tag) => score + (solvedTagWeights.get(tag) ?? 0), 0);

        if (leftScore === rightScore) {
          return compareCatalogScenarios(left, right, "default");
        }

        return rightScore - leftScore;
      })
      .slice(0, 4);
  }, [scenarios, solvedEntries, solvedScenarioIds]);

  const activeScenarioTitle =
    scenarios.find((scenario) => scenario.id === activeSession?.scenarioId)?.title ??
    activeSession?.scenarioId;

  const solvedCount = solvedEntries.length;
  const totalAttempts = attempts.length;
  const firstTrySolves = solvedEntries.filter((entry) => entry.attemptsBeforePass === 1).length;
  const lastSevenDaysSolved = solvedEntries.filter((entry) => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return new Date(entry.firstSolvedAt).getTime() >= sevenDaysAgo;
  }).length;
  const solvedLibraryCount = solvedScenarioIds.size;
  const unsolvedLibraryCount = Math.max(0, scenarios.length - solvedLibraryCount);

  const showFilterControls = activeTab !== "activity";
  const totalVisibleCount =
    activeTab === "overview"
      ? visibleOverviewScenarios.length
      : activeTab === "solved"
        ? visibleSolvedEntries.length
        : visibleInProgressEntries.length;
  const totalBaseCount =
    activeTab === "overview"
      ? scenarios.length
      : activeTab === "solved"
        ? solvedEntries.length
        : inProgressEntries.length;

  const currentSortLabel =
    activeTab === "solved" ? getSolvedSortLabel(solvedSort) : getCatalogSortLabel(catalogSort);
  const currentSortValue = activeTab === "solved" ? solvedSort : catalogSort;
  const sortFilterApplied =
    activeTab === "solved" ? solvedSort !== "recent" : catalogSort !== "default";

  const hasFiltersApplied =
    searchQuery.trim().length > 0 ||
    difficultyFilter !== "all" ||
    commonalityFilter !== "all" ||
    selectedTags.length > 0 ||
    (isLibraryMode && completionFilter !== "all") ||
    sortFilterApplied;

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
    setCatalogSort("default");
    setSolvedSort("recent");
    setCompletionFilter("all");
    setOpenMenu(null);
  };

  const recommendedNextCard = (
    <article className="bg-bg-surface border border-accent-primary/20 bg-accent-primary/5 rounded-xl p-6 h-full flex flex-col group w-full">
      <h3 className="m-0 text-lg font-bold flex items-center gap-2 text-accent-primary">
        <Trophy aria-hidden="true" className="shrink-0" size={18} />
        Recommended Next
      </h3>
      <p className="m-0 mt-3 text-sm text-text-secondary leading-relaxed flex-1">
        Suggestions based on unsolved scenarios overlapping with your solved tags.
      </p>
      {recommendedScenarios.length === 0 ? (
        <p className="m-0 mt-6 text-sm text-text-secondary bg-bg-base p-4 rounded-lg border border-border-subtle text-center">
          No recommendations yet. Solve a scenario to get suggestions.
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {recommendedScenarios.slice(0, 3).map((scenario) => (
            <Link
              className="flex flex-col gap-1.5 p-3 rounded-lg border border-border-subtle bg-bg-base hover:border-accent-primary/50 transition-colors shadow-sm"
              key={scenario.id}
              to={`/scenarios/${scenario.id}`}
            >
              <span className="text-sm font-bold text-text-primary line-clamp-1">{scenario.title}</span>
              <span className="text-xs text-text-secondary font-mono flex items-center gap-2">
                {getDifficultyLabel(scenario.difficulty)}
                <span aria-hidden="true">•</span>
                ~{scenario.estimatedTimeMinutes}m
              </span>
            </Link>
          ))}
        </div>
      )}
    </article>
  );

  if (loading) {
    return (
      <section className="flex flex-col gap-6 w-full" aria-busy="true" aria-live="polite">
        <header className="flex flex-col gap-2">
          <h1 className="m-0 flex items-center gap-2 text-[clamp(1.5rem,4vw,2rem)] font-bold tracking-tight leading-[1.2]">
            <HeaderIcon aria-hidden="true" className="shrink-0 text-accent-primary" size={20} />
            {isLibraryMode ? "Scenario Library" : "Your Progress"}
          </h1>
          <p className="m-0 text-text-readable text-lg max-w-[70ch]">
            {isLibraryMode
              ? "Browse scenarios, filter by skill area, and launch your next Git challenge."
              : "Track solved scenarios, identify gaps, and choose your next challenge."}
          </p>
        </header>
        {!isLibraryMode && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div className="skeleton min-h-[110px]" key={index} />
            ))}
          </div>
        )}
        <div className="skeleton min-h-[120px]" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="skeleton min-h-[260px]" key={index} />
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
            <HeaderIcon aria-hidden="true" className="shrink-0 text-accent-primary" size={20} />
            {isLibraryMode ? "Scenario Library" : "Your Progress"}
          </h1>
          <p className="m-0 text-text-readable text-lg max-w-[70ch]">
            {isLibraryMode
              ? "Browse scenarios, filter by skill area, and launch your next Git challenge."
              : "Track solved scenarios, identify gaps, and choose your next challenge."}
          </p>
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
          <HeaderIcon aria-hidden="true" className="shrink-0 text-accent-primary" size={20} />
          {isLibraryMode ? "Scenario Library" : "Your Progress"}
        </h1>
        <p className="m-0 text-text-readable text-lg max-w-[70ch]">
          {isLibraryMode
            ? "Find the right scenario by difficulty, commonality, or tags, then open an isolated workspace."
            : "Review what you solved, find unfinished problems, and pick the next scenario aligned to your track record."}
        </p>
      </header>

      {!isLibraryMode && (
        <>
          <nav className="flex flex-wrap gap-2" aria-label="Dashboard sections">
            <button
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-mono transition-colors ${
                activeTab === "solved"
                  ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                  : "border-border-strong bg-bg-surface text-text-secondary hover:text-text-primary hover:border-accent-primary/40"
              }`}
              onClick={() => {
                setActiveTab("solved");
              }}
              type="button"
            >
              <Trophy aria-hidden="true" className="shrink-0" size={14} />
              Solved
              <span className="text-[11px] text-text-secondary">{solvedCount}</span>
            </button>
            <button
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-mono transition-colors ${
                activeTab === "inProgress"
                  ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                  : "border-border-strong bg-bg-surface text-text-secondary hover:text-text-primary hover:border-accent-primary/40"
              }`}
              onClick={() => {
                setActiveTab("inProgress");
              }}
              type="button"
            >
              <PlayCircle aria-hidden="true" className="shrink-0" size={14} />
              In Progress
              <span className="text-[11px] text-text-secondary">{inProgressEntries.length}</span>
            </button>
            <button
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-mono transition-colors ${
                activeTab === "activity"
                  ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                  : "border-border-strong bg-bg-surface text-text-secondary hover:text-text-primary hover:border-accent-primary/40"
              }`}
              onClick={() => {
                setActiveTab("activity");
              }}
              type="button"
            >
              <History aria-hidden="true" className="shrink-0" size={14} />
              Activity
              <span className="text-[11px] text-text-secondary">{recentAttempts.length}</span>
            </button>
          </nav>

          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <article className="bg-bg-surface border border-border-subtle rounded-xl p-4">
              <p className="m-0 text-xs uppercase tracking-wider text-text-secondary font-mono mb-1">Solved Scenarios</p>
              <p className="m-0 text-2xl font-bold text-text-primary">{solvedCount}</p>
            </article>
            <article className="bg-bg-surface border border-border-subtle rounded-xl p-4">
              <p className="m-0 text-xs uppercase tracking-wider text-text-secondary font-mono mb-1">Total Attempts</p>
              <p className="m-0 text-2xl font-bold text-text-primary">{totalAttempts}</p>
            </article>
            <article className="bg-bg-surface border border-border-subtle rounded-xl p-4">
              <p className="m-0 text-xs uppercase tracking-wider text-text-secondary font-mono mb-1">First-Try Solves</p>
              <p className="m-0 text-2xl font-bold text-text-primary">{firstTrySolves}</p>
            </article>
            <article className="bg-bg-surface border border-border-subtle rounded-xl p-4">
              <p className="m-0 text-xs uppercase tracking-wider text-text-secondary font-mono mb-1">Last 7 Days Solved</p>
              <p className="m-0 text-2xl font-bold text-text-primary">{lastSevenDaysSolved}</p>
            </article>
          </section>
        </>
      )}

      {activeSession && (
        <article className="flex flex-col gap-3 p-4 border border-accent-primary bg-accent-primary/5 rounded-xl">
          <p className="m-0 flex items-center gap-2 text-accent-primary font-mono text-xs font-bold uppercase tracking-wider">
            <Activity aria-hidden="true" className="shrink-0" size={14} />
            Active Session
          </p>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <p className="m-0 text-text-primary text-sm flex items-center flex-wrap gap-2">
              <span className="font-mono bg-bg-surface-soft px-2 py-1 rounded border border-border-strong text-accent-primary">
                {activeScenarioTitle}
              </span>
              <span className="text-text-secondary font-mono">
                {getRemainingLabel(activeSession.expiresAt)}
              </span>
            </p>
            <Link
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2 bg-accent-primary text-bg-base hover:bg-accent-hover rounded-md text-sm font-bold transition-colors min-h-[40px] shrink-0 whitespace-nowrap"
              to={`/sessions/${activeSession.id}`}
            >
              <TerminalSquare aria-hidden="true" className="shrink-0" size={15} />
              Resume Workspace
            </Link>
          </div>
        </article>
      )}

      {showFilterControls && (
        <section
          className="flex flex-col xl:flex-row items-start xl:items-center gap-3 p-3 bg-bg-surface/60 border border-border-subtle rounded-xl backdrop-blur-md shadow-sm w-full"
          aria-label="Scenario search, filter, and sort controls"
          ref={controlsRef}
        >
          <label className="relative w-full xl:flex-1 min-w-0">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" aria-hidden="true">
              <Search aria-hidden="true" size={15} />
            </span>
            <input
              aria-label="Search scenarios"
              className="w-full min-h-[36px] pl-9 pr-3 bg-bg-base border border-border-strong rounded-lg text-text-primary text-[13px] transition-colors focus:outline-none focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 placeholder:text-text-secondary"
              onChange={(event) => {
                setSearchQuery(event.target.value);
              }}
              placeholder="Search by title or description"
              type="text"
              value={searchQuery}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto shrink-0">
            {isLibraryMode && (
              <div className="inline-flex min-w-fit shrink-0 rounded-lg border border-border-strong bg-bg-base p-1 w-full sm:w-auto overflow-x-auto sm:overflow-visible">
                {([
                  {
                    label: `All (${scenarios.length})`,
                    value: "all" as const
                  },
                  {
                    label: `Solved (${solvedLibraryCount})`,
                    value: "solved" as const
                  },
                  {
                    label: `Unsolved (${unsolvedLibraryCount})`,
                    value: "unsolved" as const
                  }
                ] satisfies Array<{ label: string; value: CompletionFilter }>).map((option) => (
                  <button
                    className={`px-2 min-h-[28px] rounded-md font-mono text-[11px] whitespace-nowrap transition-colors ${
                      completionFilter === option.value
                        ? "bg-accent-primary/15 text-accent-primary"
                        : "text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover"
                    }`}
                    key={option.value}
                    onClick={() => {
                      setCompletionFilter(option.value);
                    }}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}

            <div className="relative flex-1 sm:flex-none min-w-fit shrink-0">
              <button
                aria-expanded={openMenu === "difficulty"}
                aria-haspopup="listbox"
                className="w-full flex items-center justify-between gap-2 px-2.5 min-h-[36px] bg-bg-base border border-border-strong rounded-lg font-mono text-[12px] text-text-primary whitespace-nowrap transition-colors hover:bg-bg-surface-hover hover:border-accent-primary/50 focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
                onClick={() => {
                  toggleMenu("difficulty");
                }}
                type="button"
              >
                <span className="flex items-center gap-1.5">
                  <Gauge aria-hidden="true" className="shrink-0 text-text-secondary" size={14} />
                  Difficulty: {getDifficultyLabel(difficultyFilter)}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={`shrink-0 text-text-secondary transition-transform ${openMenu === "difficulty" ? "rotate-180" : ""}`}
                  size={14}
                />
              </button>
              {openMenu === "difficulty" && (
                <div aria-label="Difficulty options" className="absolute top-[calc(100%+4px)] left-0 md:right-0 z-50 min-w-[200px] max-h-[300px] overflow-y-auto bg-bg-surface-soft border border-border-strong rounded-lg p-1.5 flex flex-col gap-1 shadow-lg" role="listbox">
                  {difficultyOptions.map((option) => (
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

            <div className="relative flex-1 sm:flex-none min-w-fit shrink-0">
              <button
                aria-expanded={openMenu === "commonality"}
                aria-haspopup="listbox"
                className="w-full flex items-center justify-between gap-2 px-2.5 min-h-[36px] bg-bg-base border border-border-strong rounded-lg font-mono text-[12px] text-text-primary whitespace-nowrap transition-colors hover:bg-bg-surface-hover hover:border-accent-primary/50 focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
                onClick={() => {
                  toggleMenu("commonality");
                }}
                type="button"
              >
                <span className="flex items-center gap-1.5">
                  <Activity aria-hidden="true" className="shrink-0 text-text-secondary" size={14} />
                  Commonality: {commonalityFilter === "all" ? "All" : getCommonalityLabel(commonalityFilter)}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={`shrink-0 text-text-secondary transition-transform ${openMenu === "commonality" ? "rotate-180" : ""}`}
                  size={14}
                />
              </button>
              {openMenu === "commonality" && (
                <div aria-label="Commonality options" className="absolute top-[calc(100%+4px)] left-0 md:right-0 z-50 min-w-[200px] max-h-[300px] overflow-y-auto bg-bg-surface-soft border border-border-strong rounded-lg p-1.5 flex flex-col gap-1 shadow-lg" role="listbox">
                  {commonalityOptions.map((option) => (
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

            <div className="relative flex-1 sm:flex-none min-w-fit shrink-0">
              <button
                aria-expanded={openMenu === "tags"}
                aria-haspopup="listbox"
                className="w-full flex items-center justify-between gap-2 px-2.5 min-h-[36px] bg-bg-base border border-border-strong rounded-lg font-mono text-[12px] text-text-primary whitespace-nowrap transition-colors hover:bg-bg-surface-hover hover:border-accent-primary/50 focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
                onClick={() => {
                  toggleMenu("tags");
                }}
                type="button"
              >
                <span className="flex items-center gap-1.5">
                  <Tags aria-hidden="true" className="shrink-0 text-text-secondary" size={14} />
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

            <div className="relative flex-1 sm:flex-none min-w-fit shrink-0">
              <button
                aria-expanded={openMenu === "sort"}
                aria-haspopup="listbox"
                className="w-full flex items-center justify-between gap-2 px-2.5 min-h-[36px] bg-bg-base border border-border-strong rounded-lg font-mono text-[12px] text-text-primary whitespace-nowrap transition-colors hover:bg-bg-surface-hover hover:border-accent-primary/50 focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
                onClick={() => {
                  toggleMenu("sort");
                }}
                type="button"
              >
                <span className="flex items-center gap-1.5">
                  <ArrowDownWideNarrow aria-hidden="true" className="shrink-0 text-text-secondary" size={14} />
                  Sort: {currentSortLabel}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={`shrink-0 text-text-secondary transition-transform ${openMenu === "sort" ? "rotate-180" : ""}`}
                  size={14}
                />
              </button>
              {openMenu === "sort" && (
                <div aria-label="Sort options" className="absolute top-[calc(100%+4px)] left-0 md:right-0 z-50 min-w-[240px] max-h-[300px] overflow-y-auto bg-bg-surface-soft border border-border-strong rounded-lg p-1.5 flex flex-col gap-1 shadow-lg" role="listbox">
                  {(activeTab === "solved" ? solvedSortOptions : catalogSortOptions).map((option) => (
                    <button
                      className={`flex items-center gap-2 w-full p-2 rounded-md font-mono text-[13px] text-left transition-colors hover:bg-bg-surface-hover ${currentSortValue === option.value ? "bg-accent-primary/15 text-accent-primary" : "text-text-primary"}`}
                      key={option.value}
                      onClick={() => {
                        if (activeTab === "solved") {
                          setSolvedSort(option.value as SolvedSort);
                        } else {
                          setCatalogSort(option.value as ScenarioSort);
                        }
                        closeMenus();
                      }}
                      role="option"
                      type="button"
                    >
                      <span className="w-4 flex items-center justify-center shrink-0" aria-hidden="true">
                        {currentSortValue === option.value && <Check className="shrink-0" size={13} />}
                      </span>
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {showFilterControls && (
        <div className="flex items-center justify-between text-sm text-text-secondary">
          <p className="m-0">
            Showing {totalVisibleCount} of {totalBaseCount} {activeTab === "solved" ? "solved scenarios" : activeTab === "inProgress" ? "in-progress scenarios" : "scenarios"}
          </p>
          {hasFiltersApplied && (
            <button
              className="inline-flex items-center gap-1.5 text-accent-primary font-mono text-xs hover:underline transition-colors"
              onClick={resetControls}
              type="button"
            >
              <RotateCcw aria-hidden="true" className="shrink-0" size={12} />
              Reset filters
            </button>
          )}
        </div>
      )}

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
          {recommendedNextCard}

          {visibleOverviewScenarios.length === 0 ? (
            <article className="md:col-span-1 xl:col-span-2 2xl:col-span-3 flex flex-col items-center justify-center gap-4 min-h-[120px] p-8 text-center bg-bg-surface border border-border-subtle rounded-xl">
              <p className="m-0 text-text-secondary">No scenarios match your current filters.</p>
            </article>
          ) : (
            visibleOverviewScenarios.map((scenario) => (
                  <article
                    className="flex flex-col bg-bg-surface border border-border-subtle rounded-xl p-6 transition-all hover:border-border-strong hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/50 h-full group"
                    key={scenario.id}
                  >
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex flex-wrap gap-2">
                        <span
                          className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider border leading-none ${difficultyBadgeClass(scenario.difficulty)}`}
                        >
                          {getDifficultyLabel(scenario.difficulty)}
                        </span>
                        <span
                          className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider border leading-none ${commonalityBadgeClass(scenario.commonality)}`}
                        >
                          {getCommonalityLabel(scenario.commonality)}
                        </span>
                        {solvedScenarioIds.has(scenario.id) && (
                          <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider border leading-none text-status-pass bg-status-pass-bg border-status-pass-border">
                            Solved
                          </span>
                        )}
                      </div>
                      <span className="flex items-center gap-1.5 font-mono text-xs text-text-secondary whitespace-nowrap shrink-0">
                        <Clock3 aria-hidden="true" className="shrink-0" size={12} />
                        ~{scenario.estimatedTimeMinutes}m
                      </span>
                    </div>

                    <h2 className="m-0 mb-2 text-xl font-bold leading-tight line-clamp-2 text-text-primary group-hover:text-accent-primary transition-colors">
                      {scenario.title}
                    </h2>
                    <p className="m-0 mb-6 text-sm text-text-readable leading-relaxed line-clamp-3 flex-1">
                      {scenario.description}
                    </p>

                    <div className="flex flex-wrap gap-1.5 mb-6">
                      {scenario.tags.map((tag) => (
                        <span
                          className="bg-bg-surface-soft border border-border-strong text-text-primary text-[10px] font-mono px-2 py-0.5 rounded-full"
                          key={tag}
                        >
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
                ))
          )}
        </div>
      )}

      {activeTab === "solved" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {recommendedNextCard}
          {visibleSolvedEntries.length === 0 ? (
            <article className="lg:col-span-1 xl:col-span-2 flex flex-col items-center justify-center gap-4 min-h-[140px] p-8 text-center bg-bg-surface border border-border-subtle rounded-xl h-full">
              <p className="m-0 text-text-secondary">
                {solvedEntries.length === 0
                  ? "No solved scenarios yet. Complete your first challenge to build your solved list."
                  : "No solved scenarios match your current filters."}
              </p>
              {solvedEntries.length === 0 && (
                <Link
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-accent-primary text-bg-base hover:bg-accent-hover rounded-md text-sm font-bold min-h-[40px] transition-colors"
                  to="/library"
                >
                  <ArrowRight aria-hidden="true" className="shrink-0" size={15} />
                  Open Library
                </Link>
              )}
            </article>
          ) : (
            visibleSolvedEntries.map((entry) => (
              <article className="bg-bg-surface border border-border-subtle rounded-xl p-5 flex flex-col gap-4" key={entry.scenario.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider border leading-none ${difficultyBadgeClass(entry.scenario.difficulty)}`}
                      >
                        {getDifficultyLabel(entry.scenario.difficulty)}
                      </span>
                      <span
                        className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider border leading-none ${commonalityBadgeClass(entry.scenario.commonality)}`}
                      >
                        {getCommonalityLabel(entry.scenario.commonality)}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-text-secondary flex items-center gap-1.5">
                      <Clock3 aria-hidden="true" className="shrink-0" size={12} />
                      ~{entry.scenario.estimatedTimeMinutes}m
                    </span>
                  </div>

                  <div>
                    <h3 className="m-0 text-lg font-semibold text-text-primary">{entry.scenario.title}</h3>
                    <p className="m-0 mt-1 text-sm text-text-readable leading-relaxed line-clamp-2">
                      {entry.scenario.description}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
                    <div className="rounded-lg border border-border-subtle bg-bg-surface-soft p-3">
                      <p className="m-0 text-[10px] uppercase tracking-wider text-text-secondary font-mono mb-1">First Solved</p>
                      <p className="m-0 text-sm font-semibold">{formatDateLabel(entry.firstSolvedAt)}</p>
                    </div>
                    <div className="rounded-lg border border-border-subtle bg-bg-surface-soft p-3">
                      <p className="m-0 text-[10px] uppercase tracking-wider text-text-secondary font-mono mb-1">Attempts To Pass</p>
                      <p className="m-0 text-sm font-semibold">{entry.attemptsBeforePass}</p>
                    </div>
                    <div className="rounded-lg border border-border-subtle bg-bg-surface-soft p-3">
                      <p className="m-0 text-[10px] uppercase tracking-wider text-text-secondary font-mono mb-1">Total Attempts</p>
                      <p className="m-0 text-sm font-semibold">{entry.totalAttempts}</p>
                    </div>
                  </div>

                  <p className="m-0 text-xs text-text-secondary font-mono">
                    Last attempt {entry.lastAttemptPassed ? "passed" : "failed"} on {formatDateTimeLabel(entry.lastAttemptAt)}
                  </p>

                  <div className="flex flex-wrap gap-1.5">
                    {entry.scenario.tags.map((tag) => (
                      <span
                        className="bg-bg-surface-soft border border-border-strong text-text-primary text-[10px] font-mono px-2 py-0.5 rounded-full"
                        key={tag}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2 mt-auto">
                    <Link
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-border-strong text-text-primary text-sm hover:border-accent-primary/40 hover:bg-bg-surface-hover transition-colors"
                      to={`/scenarios/${entry.scenario.id}`}
                    >
                      Retry
                    </Link>
                    <Link
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-border-strong text-text-primary text-sm hover:border-accent-primary/40 hover:bg-bg-surface-hover transition-colors"
                      to={`/scenarios/${entry.scenario.id}`}
                    >
                      View Scenario
                    </Link>
                    <Link
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-accent-primary/30 text-accent-primary text-sm hover:bg-accent-primary/10 transition-colors"
                      to={`/sessions/${entry.latestAttemptSessionId}/result`}
                    >
                      View Result
                    </Link>
                  </div>
                </article>
              ))
          )}
        </div>
      )}

      {activeTab === "inProgress" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {recommendedNextCard}
          {visibleInProgressEntries.length === 0 ? (
            <article className="md:col-span-1 xl:col-span-2 flex flex-col items-center justify-center gap-4 min-h-[140px] p-8 text-center bg-bg-surface border border-border-subtle rounded-xl h-full">
              <p className="m-0 text-text-secondary">
                {inProgressEntries.length === 0
                  ? "No unresolved scenario attempts right now."
                  : "No in-progress scenarios match your current filters."}
              </p>
            </article>
          ) : (
            visibleInProgressEntries.map((entry) => (
              <article className="bg-bg-surface border border-border-subtle rounded-xl p-5 flex flex-col gap-4" key={entry.scenario.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider border leading-none ${difficultyBadgeClass(entry.scenario.difficulty)}`}
                    >
                      {getDifficultyLabel(entry.scenario.difficulty)}
                    </span>
                    <span className="font-mono text-xs text-text-secondary">{entry.totalAttempts} attempts</span>
                  </div>
                  <h3 className="m-0 text-lg font-semibold text-text-primary">{entry.scenario.title}</h3>
                  <p className="m-0 text-sm text-text-readable line-clamp-3">{entry.scenario.description}</p>
                  <p className="m-0 text-xs text-text-secondary font-mono">
                    Last attempt {entry.lastAttemptPassed ? "passed" : "failed"} on {formatDateTimeLabel(entry.lastAttemptAt)}
                  </p>
                  <Link
                    className="mt-auto inline-flex items-center justify-center gap-2 px-4 py-2 bg-accent-primary/10 border border-accent-primary/30 text-accent-primary hover:bg-accent-primary hover:text-bg-base rounded-md text-sm font-semibold min-h-[40px] transition-colors"
                    to={`/scenarios/${entry.scenario.id}`}
                  >
                    Continue Scenario
                    <ArrowRight aria-hidden="true" className="shrink-0" size={15} />
                  </Link>
                </article>
            ))
          )}
        </div>
      )}

      {activeTab === "activity" && (
        <>
          {recentAttempts.length === 0 ? (
            <article className="flex flex-col items-center justify-center gap-4 min-h-[140px] p-8 text-center bg-bg-surface border border-border-subtle rounded-xl">
              <p className="m-0 text-text-secondary">No activity yet. Start a scenario to build your timeline.</p>
            </article>
          ) : (
            <div className="w-full overflow-x-auto bg-bg-surface border border-border-subtle rounded-xl shadow-sm">
              <table className="w-full min-w-[860px] border-collapse">
                <thead>
                  <tr>
                    <th className="bg-bg-surface-soft text-text-secondary font-mono text-xs font-semibold uppercase tracking-wider p-4 text-left border-b border-border-subtle">Scenario</th>
                    <th className="bg-bg-surface-soft text-text-secondary font-mono text-xs font-semibold uppercase tracking-wider p-4 text-left border-b border-border-subtle">
                      <span className="flex items-center gap-1.5">
                        <CalendarDays aria-hidden="true" className="shrink-0" size={13} />
                        Evaluated At
                      </span>
                    </th>
                    <th className="bg-bg-surface-soft text-text-secondary font-mono text-xs font-semibold uppercase tracking-wider p-4 text-left border-b border-border-subtle">Status</th>
                    <th className="bg-bg-surface-soft text-text-secondary font-mono text-xs font-semibold uppercase tracking-wider p-4 text-left border-b border-border-subtle">Checks</th>
                    <th className="bg-bg-surface-soft text-text-secondary font-mono text-xs font-semibold uppercase tracking-wider p-4 text-left border-b border-border-subtle">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recentAttempts.map((attempt) => {
                    const scenarioTitle = scenarioTitleById.get(attempt.scenarioId) ?? attempt.scenarioId;
                    const passedChecks = attempt.assertions.filter((assertion) => assertion.passed).length;

                    return (
                      <tr key={attempt.id} className="hover:bg-bg-surface-hover/50 transition-colors">
                        <td className="p-4 text-sm border-b border-border-subtle last:border-b-0">
                          <Link className="text-accent-primary font-semibold hover:text-accent-hover hover:underline" to={`/scenarios/${attempt.scenarioId}`}>
                            {scenarioTitle}
                          </Link>
                        </td>
                        <td className="p-4 text-sm border-b border-border-subtle last:border-b-0 font-mono text-text-secondary">
                          {formatDateTimeLabel(attempt.evaluatedAt)}
                        </td>
                        <td className="p-4 text-sm border-b border-border-subtle last:border-b-0">
                          <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full font-mono text-[11px] font-bold uppercase tracking-wider border leading-none ${attempt.passed ? "text-status-pass bg-status-pass-bg border-status-pass-border" : "text-status-fail bg-status-fail-bg border-status-fail-border"}`}>
                            {attempt.passed ? "Pass" : "Fail"}
                          </span>
                        </td>
                        <td className="p-4 text-sm border-b border-border-subtle last:border-b-0 font-mono text-text-secondary">
                          {passedChecks}/{attempt.assertions.length}
                        </td>
                        <td className="p-4 text-sm border-b border-border-subtle last:border-b-0">
                          <Link className="inline-flex items-center gap-1.5 text-accent-primary font-semibold hover:text-accent-hover hover:underline text-sm" to={`/sessions/${attempt.sessionId}/result`}>
                            View Result
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
