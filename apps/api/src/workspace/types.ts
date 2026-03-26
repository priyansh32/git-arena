import type { WorkspaceSpec } from "./spec.js";

const WORKSPACE_TYPES: Record<string, WorkspaceSpec> = {
  git: {
    image: "gitarena-base:2.43.7-alpine3.19-v1",
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
      runtime: "runsc", // for docker provider; ignored for k8s provider
      network: "none"
    }
  }
};

export const VALID_WORKSPACE_TYPES = Object.keys(WORKSPACE_TYPES);

export function getWorkspaceSpec(
  workspaceType: string,
  imageOverride?: string
): WorkspaceSpec {
  const spec = WORKSPACE_TYPES[workspaceType];
  if (!spec) {
    throw new Error(
      `Unknown workspace type '${workspaceType}'. Valid types: ${VALID_WORKSPACE_TYPES.join(", ")}`
    );
  }

  if (imageOverride) {
    return { ...spec, image: imageOverride };
  }

  return spec;
}
