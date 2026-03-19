import type { Scenario } from "@gitarena/shared";

export const defaultScenarios: Scenario[] = [
  {
    id: "detached-head-recovery",
    title: "Detached HEAD Recovery",
    description: "Recover lost work and move back to a named branch.",
    objective: "Fix detached HEAD and preserve feature commit history.",
    difficulty: "beginner",
    estimatedTimeMinutes: 15,
    tags: ["detached-head", "branches"],
    hints: [
      "Start with `git status` and `git branch --show-current` to confirm detached state.",
      "Use `git reflog` or commit history to locate recoverable branch tip.",
      "Create a branch at the correct commit before making further history edits."
    ],
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
    hints: [
      "Inspect recent commits with `git log --oneline --graph -n 10`.",
      "Use interactive rebase to reorder/squash without changing final content.",
      "Re-run log and verify only intended commits remain in sequence."
    ],
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
    hints: [
      "Compare local and remote refs before resolving divergence.",
      "Choose merge or rebase based on target history policy for the branch.",
      "After reconciliation, validate branch contents before push."
    ],
    status: "published"
  }
];
