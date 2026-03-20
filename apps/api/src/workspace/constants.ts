export const K8S_SEEDED_ANNOTATION = "gitarena.dev/seeded";

export const POLICY_ENV_ALLOWLIST = [
  { name: "HOME", value: "/home/gituser" },
  { name: "SHELL", value: "/bin/bash" },
  { name: "TERM", value: "xterm-256color" },
  { name: "GIT_AUTHOR_NAME", value: "Git Arena" },
  { name: "GIT_AUTHOR_EMAIL", value: "user@gitarena.dev" },
  { name: "GIT_COMMITTER_NAME", value: "Git Arena" },
  { name: "GIT_COMMITTER_EMAIL", value: "user@gitarena.dev" },
  { name: "LANG", value: "en_US.UTF-8" }
] as const;
