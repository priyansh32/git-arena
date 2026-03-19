import type { Scenario } from "@gitarena/shared";

const scenarios: Scenario[] = [
  {
    id: "detached-head-recovery",
    title: "Detached HEAD Recovery",
    description: "Recover lost work and move back to a named branch.",
    objective: "Fix detached HEAD and preserve feature commit history.",
    difficulty: "beginner",
    estimatedTimeMinutes: 15,
    tags: ["detached-head", "branches"],
    status: "published"
  },
  {
    id: "interactive-rebase-cleanup",
    title: "Interactive Rebase Cleanup",
    description: "Rewrite a noisy commit stack into a clean history.",
    objective: "Squash and reorder commits into a clean linear branch.",
    difficulty: "intermediate",
    estimatedTimeMinutes: 25,
    tags: ["rebase", "history"],
    status: "published"
  },
  {
    id: "remote-divergence-resolution",
    title: "Remote Divergence Resolution",
    description: "Resolve local/remote divergence with safe history handling.",
    objective: "Synchronize branch with origin while preserving local changes.",
    difficulty: "advanced",
    estimatedTimeMinutes: 35,
    tags: ["remote", "merge", "rebase"],
    status: "published"
  }
];

export function listPublishedScenarios(): Scenario[] {
  return scenarios.filter((scenario) => scenario.status === "published");
}

export function getScenarioById(id: string): Scenario | undefined {
  return scenarios.find((scenario) => scenario.id === id);
}
