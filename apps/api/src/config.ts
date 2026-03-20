import { z } from "zod";

const workspaceProviderSchema = z.enum(["docker", "kubernetes"]);
const workspaceImagePullPolicySchema = z.enum(["Always", "IfNotPresent", "Never"]);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(5173),
  DATABASE_URL: z
    .string()
    .default("postgres://gitarena:gitarena@localhost:5432/gitarena"),
  CORS_ORIGINS: z.string().optional(),
  WORKSPACE_PROVIDER: workspaceProviderSchema.default("docker"),
  WORKSPACE_IMAGE: z.string().default("gitarena-base:2.43.7-alpine3.19-v1"),
  WORKSPACE_ROOT: z.string().default("/workspace"),
  WORKSPACE_SHELL: z.string().default("/bin/bash"),
  WORKSPACE_CONTAINER_PREFIX: z.string().default("gitarena-ws"),
  WORKSPACE_INIT_COMMAND: z
    .string()
    .default("mkdir -p /workspace && cd /workspace && exec tail -f /dev/null"),
  WORKSPACE_K8S_NAMESPACE: z.string().default("gitarena-sessions"),
  WORKSPACE_K8S_RUNTIME_CLASS_NAME: z.string().default("gvisor"),
  WORKSPACE_K8S_IMAGE_PULL_POLICY: workspaceImagePullPolicySchema.default("IfNotPresent"),
  WORKSPACE_K8S_POD_READY_TIMEOUT_SECONDS: z.coerce.number().int().min(5).max(600).default(240),
  GOOGLE_CLIENT_ID: z.string().trim().min(1),
  SESSION_COOKIE_NAME: z.string().default("gitarena_session"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(24 * 7)
});

export type WorkspaceProvider = z.infer<typeof workspaceProviderSchema>;
export type WorkspaceImagePullPolicy = z.infer<typeof workspaceImagePullPolicySchema>;

export interface WorkspaceKubernetesConfig {
  namespace: string;
  runtimeClassName: string;
  imagePullPolicy: WorkspaceImagePullPolicy;
  podReadyTimeoutSeconds: number;
}

export interface WorkspaceConfig {
  provider: WorkspaceProvider;
  image: string;
  rootDir: string;
  shell: string;
  containerPrefix: string;
  initCommand: string;
  kubernetes: WorkspaceKubernetesConfig;
}

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  databaseUrl: string;
  corsOrigins: string[];
  workspace: WorkspaceConfig;
  auth: {
    googleClientId: string;
    sessionCookieName: string;
    sessionTtlHours: number;
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  const corsOriginSource =
    parsed.CORS_ORIGINS && parsed.CORS_ORIGINS.trim().length > 0
      ? parsed.CORS_ORIGINS
      : `http://localhost:${parsed.WEB_PORT}`;
  const corsOrigins = corsOriginSource.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    corsOrigins,
    workspace: {
      provider: parsed.WORKSPACE_PROVIDER,
      image: parsed.WORKSPACE_IMAGE,
      rootDir: parsed.WORKSPACE_ROOT,
      shell: parsed.WORKSPACE_SHELL,
      containerPrefix: parsed.WORKSPACE_CONTAINER_PREFIX,
      initCommand: parsed.WORKSPACE_INIT_COMMAND,
      kubernetes: {
        namespace: parsed.WORKSPACE_K8S_NAMESPACE,
        runtimeClassName: parsed.WORKSPACE_K8S_RUNTIME_CLASS_NAME,
        imagePullPolicy: parsed.WORKSPACE_K8S_IMAGE_PULL_POLICY,
        podReadyTimeoutSeconds: parsed.WORKSPACE_K8S_POD_READY_TIMEOUT_SECONDS
      }
    },
    auth: {
      googleClientId: parsed.GOOGLE_CLIENT_ID,
      sessionCookieName: parsed.SESSION_COOKIE_NAME,
      sessionTtlHours: parsed.SESSION_TTL_HOURS
    }
  };
}
