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

export interface WorkspaceSpec {
  image: string;
  resources: WorkspaceResources;
  monitoring: WorkspaceMonitoringLimits;
  security: WorkspaceSecurity;
}
