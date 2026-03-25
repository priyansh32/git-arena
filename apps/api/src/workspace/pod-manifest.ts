import type { Session } from "@gitarena/shared";

import type { WorkspaceConfig } from "../config.js";
import { K8S_SEEDED_ANNOTATION } from "./constants.js";
import type { WorkspaceSpec } from "./spec.js";

export function buildWorkspacePodManifest(
  podName: string,
  session: Session,
  config: WorkspaceConfig,
  spec: WorkspaceSpec
): Record<string, unknown> {
  const [uid, gid] = spec.security.user.split(":").map(Number);

  const podSpec: Record<string, unknown> = {
    runtimeClassName: spec.security.runtime,
    automountServiceAccountToken: false,
    enableServiceLinks: false,
    serviceAccountName: "",
    securityContext: {
      runAsNonRoot: true,
      runAsUser: uid,
      runAsGroup: gid,
      fsGroup: gid,
      seccompProfile: {
        type: "RuntimeDefault"
      }
    },
    restartPolicy: "Never",
    terminationGracePeriodSeconds: 10,
    containers: [
      {
        name: "challenge",
        image: spec.image,
        imagePullPolicy: config.kubernetes.imagePullPolicy,
        securityContext: {
          allowPrivilegeEscalation: false,
          readOnlyRootFilesystem: false,
          capabilities: {
            drop: ["ALL"]
          }
        },
        resources: {
          requests: {
            memory: `${Math.floor(spec.resources.memoryMb / 2)}Mi`,
            cpu: `${Math.floor(spec.resources.cpuMillicores / 2)}m`
          },
          limits: {
            memory: `${spec.resources.memoryMb}Mi`,
            cpu: `${spec.resources.cpuMillicores}m`,
            "ephemeral-storage": `${spec.resources.ephemeralStorageMb}Mi`
          }
        }
      }
    ]
  };

  if (config.kubernetes.nodePool) {
    podSpec.nodeSelector = {
      "cloud.google.com/gke-nodepool": config.kubernetes.nodePool
    };
  }

  return {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: podName,
      namespace: config.kubernetes.namespace,
      labels: {
        app: "challenge-session",
        "session-id": session.id,
        "user-id": session.userId,
        "scenario-id": session.scenarioId
      },
      annotations: {
        [K8S_SEEDED_ANNOTATION]: "false"
      }
    },
    spec: podSpec
  };
}
