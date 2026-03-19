import type { Scenario } from "@gitarena/shared";

export const defaultScenarios: Scenario[] = [
  {
    id: "detached-head-recovery",
    title: "Detached HEAD Recovery",
    description: "Recover lost work and move back to a named branch.",
    objective:
      "Recover the detached commit onto branch `feature/recovery`, reattach HEAD, and keep existing tags.",
    difficulty: "beginner",
    estimatedTimeMinutes: 15,
    tags: ["detached-head", "branches"],
    hints: [
      "Start with `git status` and `git branch --show-current` to confirm detached state.",
      "Use `git reflog` or commit history to locate recoverable branch tip.",
      "Create `feature/recovery` at the detached commit before making further history edits."
    ],
    status: "published"
  },
  {
    id: "interactive-rebase-cleanup",
    title: "Interactive Rebase Cleanup",
    description: "Rewrite a noisy commit stack into a clean history.",
    objective:
      "Turn the feature stack into one clean commit on top of main while preserving repository content.",
    difficulty: "intermediate",
    estimatedTimeMinutes: 25,
    tags: ["rebase", "history"],
    hints: [
      "Inspect recent commits with `git log --oneline --graph -n 10`.",
      "Use interactive rebase (or an equivalent approach) to collapse the stack to one commit.",
      "Re-run log and verify only one non-temporary commit is ahead of main."
    ],
    status: "published"
  },
  {
    id: "remote-divergence-resolution",
    title: "Remote Divergence Resolution",
    description: "Resolve local/remote divergence with safe history handling.",
    objective:
      "Reconcile local and origin/main divergence, preserve both change sets, and end with no ahead/behind diff.",
    difficulty: "advanced",
    estimatedTimeMinutes: 35,
    tags: ["remote", "merge", "rebase"],
    hints: [
      "Compare local and remote refs before resolving divergence.",
      "Choose merge or rebase based on target history policy for the branch.",
      "After reconciliation, push/fetch until `git rev-list --left-right --count HEAD...origin/main` is `0 0`."
    ],
    status: "published"
  }
];
