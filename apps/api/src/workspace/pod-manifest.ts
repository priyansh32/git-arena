import type { Session } from "@gitarena/shared";

import type { WorkspaceConfig } from "../config.js";
import { K8S_SEEDED_ANNOTATION, POLICY_ENV_ALLOWLIST } from "./constants.js";

export function buildWorkspacePodManifest(
  podName: string,
  session: Session,
  config: WorkspaceConfig
): Record<string, unknown> {
  const spec: Record<string, unknown> = {
    runtimeClassName: config.kubernetes.runtimeClassName,
    automountServiceAccountToken: false,
    enableServiceLinks: false,
    serviceAccountName: "",
    securityContext: {
      runAsNonRoot: true,
      runAsUser: 1000,
      runAsGroup: 1000,
      fsGroup: 1000,
      seccompProfile: {
        type: "RuntimeDefault"
      }
    },
    restartPolicy: "Never",
    terminationGracePeriodSeconds: 10,
    containers: [
      {
        name: "challenge",
        image: config.image,
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
            memory: "128Mi",
            cpu: "250m"
          },
          limits: {
            memory: "256Mi",
            cpu: "500m",
            "ephemeral-storage": "1Gi"
          }
        },
        env: POLICY_ENV_ALLOWLIST,
        ports: [
          {
            containerPort: 7681,
            protocol: "TCP"
          }
        ],
        livenessProbe: {
          exec: {
            command: ["/bin/bash", "-lc", "echo > /dev/tcp/127.0.0.1/7681"]
          },
          initialDelaySeconds: 5,
          timeoutSeconds: 2,
          periodSeconds: 10
        }
      }
    ]
  };

  if (config.kubernetes.nodePool) {
    spec.nodeSelector = {
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
    spec
  };
}
