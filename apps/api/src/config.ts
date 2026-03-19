import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z
    .string()
    .default("postgres://gitarena:gitarena@localhost:5432/gitarena"),
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://localhost:8080"),
  WORKSPACE_IMAGE: z.string().default("alpine/git:2.47.2"),
  WORKSPACE_ROOT: z.string().default("/workspace"),
  WORKSPACE_SHELL: z.string().default("/bin/sh"),
  WORKSPACE_CONTAINER_PREFIX: z.string().default("gitarena-ws"),
  WORKSPACE_INIT_COMMAND: z
    .string()
    .default("mkdir -p /workspace && cd /workspace && exec tail -f /dev/null"),
  AUTH_MODE: z.enum(["simulated", "google"]).default("simulated"),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  SESSION_COOKIE_NAME: z.string().default("gitarena_session"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(24 * 7)
});

export interface WorkspaceConfig {
  image: string;
  rootDir: string;
  shell: string;
  containerPrefix: string;
  initCommand: string;
}

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  databaseUrl: string;
  corsOrigins: string[];
  workspace: WorkspaceConfig;
  auth: {
    mode: "simulated" | "google";
    googleClientId: string | null;
    sessionCookieName: string;
    sessionTtlHours: number;
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  const googleClientId = parsed.GOOGLE_CLIENT_ID.trim();

  if (parsed.AUTH_MODE === "google" && googleClientId.length === 0) {
    throw new Error("GOOGLE_CLIENT_ID is required when AUTH_MODE=google");
  }

  const corsOrigins = parsed.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    corsOrigins,
    workspace: {
      image: parsed.WORKSPACE_IMAGE,
      rootDir: parsed.WORKSPACE_ROOT,
      shell: parsed.WORKSPACE_SHELL,
      containerPrefix: parsed.WORKSPACE_CONTAINER_PREFIX,
      initCommand: parsed.WORKSPACE_INIT_COMMAND
    },
    auth: {
      mode: parsed.AUTH_MODE,
      googleClientId: googleClientId.length > 0 ? googleClientId : null,
      sessionCookieName: parsed.SESSION_COOKIE_NAME,
      sessionTtlHours: parsed.SESSION_TTL_HOURS
    }
  };
}
