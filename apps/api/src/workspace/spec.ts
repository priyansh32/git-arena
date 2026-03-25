export interface WorkspaceResources {
  memoryMb: number;
  cpuMillicores: number;
  ephemeralStorageMb: number;
  pidsLimit: number;
}

export interface WorkspaceMonitoringLimits {
  memoryTerminationMb: number;
  cpuTerminationMillicores: number;
  ephemeralStorageTerminationMb: number;
  processAnomalyThreshold: number;
  processTerminationThreshold: number;
  idleTimeoutMs: number;
  largeFileSizeMb: number;
}

export interface WorkspaceSecurity {
  user: string;
  runtime?: string;
  network: "none" | "default";
}

export interface WorkspaceHealthcheck {
  command: string;
  intervalSeconds: number;
  timeoutSeconds: number;
  retries: number;
  startPeriodSeconds: number;
}

export interface WorkspaceSpec {
  image: string;
  workingDir: string;
  shell: string;
  env: { name: string; value: string }[];
  resources: WorkspaceResources;
  monitoring: WorkspaceMonitoringLimits;
  security: WorkspaceSecurity;
  healthcheck: WorkspaceHealthcheck;
  initCommand: string;
  terminalBootstrapEnv: Record<string, string>;
}

export interface WorkspaceSpecOverrides {
  image?: string;
}

export function buildDefaultWorkspaceSpec(overrides?: WorkspaceSpecOverrides): WorkspaceSpec {
  return {
    image: overrides?.image ?? "gitarena-base:2.43.7-alpine3.19-v1",
    workingDir: "/workspace",
    shell: "/bin/bash",
    env: [
      { name: "HOME", value: "/home/gituser" },
      { name: "SHELL", value: "/bin/bash" },
      { name: "TERM", value: "xterm-256color" },
      { name: "GIT_AUTHOR_NAME", value: "Git Arena" },
      { name: "GIT_AUTHOR_EMAIL", value: "user@gitarena.dev" },
      { name: "GIT_COMMITTER_NAME", value: "Git Arena" },
      { name: "GIT_COMMITTER_EMAIL", value: "user@gitarena.dev" },
      { name: "LANG", value: "en_US.UTF-8" }
    ],
    resources: {
      memoryMb: 256,
      cpuMillicores: 500,
      ephemeralStorageMb: 1024,
      pidsLimit: 100
    },
    monitoring: {
      memoryTerminationMb: 240,
      cpuTerminationMillicores: 480,
      ephemeralStorageTerminationMb: 900,
      processAnomalyThreshold: 50,
      processTerminationThreshold: 100,
      idleTimeoutMs: 5 * 60 * 1000,
      largeFileSizeMb: 50
    },
    security: {
      user: "1000:1000",
      runtime: "runsc",
      network: "none"
    },
    healthcheck: {
      command: "test -d /workspace && test -w /workspace",
      intervalSeconds: 10,
      timeoutSeconds: 2,
      retries: 3,
      startPeriodSeconds: 10
    },
    initCommand: "mkdir -p /workspace && cd /workspace && exec tail -f /dev/null",
    terminalBootstrapEnv: {
      GIT_PAGER: "cat",
      PAGER: "cat",
      LESS: "FRX"
    }
  };
}
