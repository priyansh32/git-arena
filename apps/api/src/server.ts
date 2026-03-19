import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import type {
  AssertionResult,
  AuthUserResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  CurrentUserResponse,
  RequestHintResponse,
  SubmitSessionResponse,
  UserProfile
} from "@gitarena/shared";
import { z } from "zod";

import {
  createSessionToken,
  hashSessionToken,
  parseCookieHeader,
  verifyGoogleIdToken
} from "./auth.js";
import { loadConfig } from "./config.js";
import { Repository } from "./repository.js";
import {
  WorkspaceManager,
  WorkspaceProvisionError
} from "./workspace-manager.js";

declare module "fastify" {
  interface FastifyRequest {
    user: UserProfile | null;
    sessionTokenHash: string | null;
  }
}

const createSessionSchema = z.object({
  scenarioId: z.string().min(1)
});

const paramsSchema = z.object({
  id: z.string().min(1)
});

const wsQuerySchema = z.object({
  token: z.string().min(1)
});

const googleLoginSchema = z.object({
  idToken: z.string().min(1)
});

const config = loadConfig();
const repository = new Repository(config.databaseUrl);
const workspaceManager = new WorkspaceManager(config.workspace);

const app = Fastify({
  logger: {
    level: config.nodeEnv === "production" ? "info" : "debug"
  }
});

const sessionCookieOptions = {
  path: "/",
  httpOnly: true,
  secure: config.nodeEnv === "production",
  sameSite: "lax" as const
};
const sessionCookieMaxAgeSeconds = config.auth.sessionTtlHours * 60 * 60;

await app.register(cors, {
  origin: config.corsOrigins,
  credentials: true
});
await app.register(cookie);
await app.register(websocket);

app.decorateRequest("user", null);
app.decorateRequest("sessionTokenHash", null);

app.addHook("onRequest", async (request, reply) => {
  request.user = null;
  request.sessionTokenHash = null;

  const sessionToken = request.cookies[config.auth.sessionCookieName];
  if (!sessionToken) {
    return;
  }

  const tokenHash = hashSessionToken(sessionToken);
  const user = await repository.getUserBySessionTokenHash(tokenHash);
  if (!user) {
    reply.clearCookie(config.auth.sessionCookieName, sessionCookieOptions);
    return;
  }

  request.sessionTokenHash = tokenHash;
  request.user = user;
});

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);

  if (error instanceof z.ZodError) {
    return reply.code(400).send({
      message: "Validation failed",
      issues: error.issues
    });
  }

  return reply.code(500).send({ message: "Internal server error" });
});

function requireUser(request: FastifyRequest, reply: FastifyReply): UserProfile | null {
  if (!request.user) {
    void reply.code(401).send({ message: "Authentication required" });
    return null;
  }

  return request.user;
}

app.get("/api/v1/health/live", async () => ({
  status: "ok",
  service: "api"
}));

app.get("/api/v1/health/ready", async (_request, reply) => {
  try {
    await repository.ping();
    return { status: "ok", db: "up" };
  } catch (error) {
    app.log.error(error);
    return reply.code(503).send({ status: "error", db: "down" });
  }
});

app.get("/api/v1/health", async (_request, reply) => {
  try {
    await repository.ping();
    return { status: "ok" };
  } catch (error) {
    app.log.error(error);
    return reply.code(503).send({ status: "error" });
  }
});

app.post("/api/v1/auth/google", async (request, reply) => {
  const payload = googleLoginSchema.parse(request.body);

  let identity;
  try {
    identity = await verifyGoogleIdToken(payload.idToken, config.auth.googleClientId);
  } catch (error) {
    app.log.warn({ error }, "Rejected invalid Google ID token");
    return reply.code(401).send({ message: "Invalid Google ID token" });
  }

  const user = await repository.upsertGoogleUser(identity);
  const sessionToken = createSessionToken();
  const tokenHash = hashSessionToken(sessionToken);
  const expiresAt = new Date(Date.now() + sessionCookieMaxAgeSeconds * 1000);

  await repository.createAuthSession({
    userId: user.id,
    tokenHash,
    expiresAt,
    userAgent: request.headers["user-agent"] ?? null,
    ipAddress: request.ip ?? null
  });

  reply.setCookie(config.auth.sessionCookieName, sessionToken, {
    ...sessionCookieOptions,
    maxAge: sessionCookieMaxAgeSeconds
  });

  const response: AuthUserResponse = { user };
  return response;
});

app.post("/api/v1/auth/logout", async (request, reply) => {
  if (request.sessionTokenHash) {
    await repository.revokeAuthSessionByTokenHash(request.sessionTokenHash);
  }

  reply.clearCookie(config.auth.sessionCookieName, sessionCookieOptions);
  return { ok: true };
});

app.get("/api/v1/users/me", async (request) => {
  const response: CurrentUserResponse = {
    user: request.user
  };

  return response;
});

app.get("/api/v1/scenarios", async () => {
  const scenarios = await repository.listPublishedScenarios();
  return { scenarios };
});

app.get("/api/v1/scenarios/:id", async (request, reply) => {
  const { id } = paramsSchema.parse(request.params);
  const scenario = await repository.getScenarioById(id);

  if (!scenario) {
    return reply.code(404).send({ message: "Scenario not found" });
  }

  return { scenario };
});

app.get("/api/v1/scenarios/:id/attempts", async (request, reply) => {
  const user = requireUser(request, reply);
  if (!user) {
    return;
  }

  const { id } = paramsSchema.parse(request.params);
  const scenario = await repository.getScenarioById(id);

  if (!scenario) {
    return reply.code(404).send({ message: "Scenario not found" });
  }

  const attempts = await repository.listAttemptsByScenario(user.id, id);
  return { attempts };
});

app.get("/api/v1/users/me/active-session", async (request, reply) => {
  const user = requireUser(request, reply);
  if (!user) {
    return;
  }

  const session = await repository.getActiveSessionByUser(user.id);
  return { session };
});

app.get("/api/v1/users/me/history", async (request, reply) => {
  const user = requireUser(request, reply);
  if (!user) {
    return;
  }

  const attempts = await repository.listAttemptsByUser(user.id);
  return { attempts };
});

app.post("/api/v1/sessions", async (request, reply) => {
  const user = requireUser(request, reply);
  if (!user) {
    return;
  }

  const payload = createSessionSchema.parse(request.body) as CreateSessionRequest;
  const scenario = await repository.getScenarioById(payload.scenarioId);

  if (!scenario || scenario.status !== "published") {
    return reply.code(404).send({ message: "Scenario not found or unavailable" });
  }

  const activeSession = await repository.getActiveSessionByUser(user.id);
  if (activeSession) {
    return reply.code(409).send({
      message: "Finish or quit your active session before starting another.",
      session: activeSession
    });
  }

  const session = await repository.createSession(user.id, payload.scenarioId);
  try {
    await workspaceManager.ensureWorkspace(session);
  } catch (error) {
    app.log.error(
      { error, sessionId: session.id },
      "Failed to provision workspace container"
    );
    await repository.terminateSession(session.id, user.id);

    return reply.code(503).send({
      message: "Unable to provision workspace container. Verify Docker is available."
    });
  }

  const response: CreateSessionResponse = { session };
  return reply.code(201).send(response);
});

app.get("/api/v1/sessions/:id", async (request, reply) => {
  const user = requireUser(request, reply);
  if (!user) {
    return;
  }

  const { id } = paramsSchema.parse(request.params);
  const session = await repository.getSessionById(id);

  if (!session || session.userId !== user.id) {
    return reply.code(404).send({ message: "Session not found" });
  }

  if (session.status === "active" || session.status === "submitted") {
    try {
      await workspaceManager.ensureWorkspace(session);
    } catch (error) {
      app.log.error(
        { error, sessionId: session.id },
        "Failed to ensure workspace container"
      );
      return reply.code(503).send({
        message: "Workspace is unavailable. Retry in a moment."
      });
    }
  }

  return { session };
});

app.get("/ws/sessions/:id", { websocket: true } as any, (connection: any, request: any) => {
  void (async () => {
    const { id } = paramsSchema.parse(request.params);
    const { token } = wsQuerySchema.parse(request.query);
    const cookies = parseCookieHeader(request.headers?.cookie);
    const sessionToken = cookies[config.auth.sessionCookieName];

    if (!sessionToken) {
      connection.socket.close(1008, "Authentication required");
      return;
    }

    const user = await repository.getUserBySessionTokenHash(hashSessionToken(sessionToken));
    if (!user) {
      connection.socket.close(1008, "Authentication required");
      return;
    }

    const session = await repository.getSessionById(id);
    if (!session || session.userId !== user.id) {
      connection.socket.close(1008, "Session not found");
      return;
    }

    if (session.wsToken !== token) {
      connection.socket.close(1008, "Invalid token");
      return;
    }

    if (session.status !== "active" && session.status !== "submitted") {
      connection.socket.close(1008, "Session is closed");
      return;
    }

    try {
      await workspaceManager.ensureWorkspace(session);
    } catch (error) {
      app.log.error(
        { error, sessionId: session.id },
        "Failed to ensure workspace before terminal attach"
      );
      connection.socket.close(1011, "Workspace unavailable");
      return;
    }

    const terminal = workspaceManager.openTerminal(session.id);

    const writeToSocket = (chunk: Buffer): void => {
      if (connection.socket.readyState === connection.socket.OPEN) {
        connection.socket.send(chunk.toString("utf8"));
      }
    };

    terminal.stdout.on("data", (chunk: Buffer) => {
      writeToSocket(chunk);
    });

    terminal.stderr.on("data", (chunk: Buffer) => {
      writeToSocket(chunk);
    });

    terminal.on("error", (error) => {
      app.log.error({ error, sessionId: session.id }, "Terminal process failed");
      if (connection.socket.readyState === connection.socket.OPEN) {
        connection.socket.send("\r\n[terminal unavailable]\r\n");
        connection.socket.close(1011, "Terminal unavailable");
      }
    });

    terminal.on("close", () => {
      if (connection.socket.readyState === connection.socket.OPEN) {
        connection.socket.close(1000, "Terminal closed");
      }
    });

    connection.socket.on("message", (data: any) => {
      if (!terminal.stdin.writable) {
        return;
      }

      if (typeof data === "string") {
        terminal.stdin.write(data);
        return;
      }

      if (Array.isArray(data)) {
        terminal.stdin.write(Buffer.concat(data));
        return;
      }

      if (data instanceof ArrayBuffer) {
        terminal.stdin.write(Buffer.from(data));
        return;
      }

      terminal.stdin.write(data);
    });

    connection.socket.on("close", () => {
      if (!terminal.killed) {
        terminal.kill("SIGKILL");
      }
    });
  })().catch((error) => {
    app.log.error({ error }, "Websocket session initialization failed");
    if (connection.socket.readyState === connection.socket.OPEN) {
      connection.socket.close(1011, "Terminal initialization failed");
    }
  });
});

app.get("/api/v1/sessions/:id/result", async (request, reply) => {
  const user = requireUser(request, reply);
  if (!user) {
    return;
  }

  const { id } = paramsSchema.parse(request.params);
  const result = await repository.getSessionResult(id, user.id);

  if (!result) {
    return reply.code(404).send({ message: "Result not found" });
  }

  const response: SubmitSessionResponse = {
    attempt: result.attempt,
    session: result.session
  };

  return response;
});

app.delete("/api/v1/sessions/:id", async (request, reply) => {
  const user = requireUser(request, reply);
  if (!user) {
    return;
  }

  const { id } = paramsSchema.parse(request.params);
  const terminatedSession = await repository.terminateSession(id, user.id);

  if (!terminatedSession) {
    return reply.code(404).send({ message: "Session not found or already closed" });
  }

  try {
    await workspaceManager.stopWorkspace(id);
  } catch (error) {
    if (!(error instanceof WorkspaceProvisionError)) {
      app.log.warn({ error, sessionId: id }, "Workspace cleanup failed");
    }
  }

  return { session: terminatedSession };
});

app.post("/api/v1/sessions/:id/hint", async (request, reply) => {
  const user = requireUser(request, reply);
  if (!user) {
    return;
  }

  const { id } = paramsSchema.parse(request.params);
  const hintResult = await repository.requestHint(id, user.id);

  if (!hintResult) {
    return reply.code(404).send({ message: "Session not found or inactive" });
  }

  const response: RequestHintResponse = {
    hintIndex: hintResult.hintIndex,
    hint: hintResult.hint,
    session: hintResult.session
  };

  return response;
});

app.post("/api/v1/sessions/:id/submit", async (request, reply) => {
  const user = requireUser(request, reply);
  if (!user) {
    return;
  }

  const { id } = paramsSchema.parse(request.params);
  const session = await repository.getSessionById(id);
  if (!session || session.userId !== user.id) {
    return reply.code(404).send({ message: "Session not found or unavailable" });
  }

  let assertionResults: AssertionResult[] | undefined;
  if (session.status === "active" || session.status === "submitted") {
    try {
      await workspaceManager.ensureWorkspace(session);
    } catch (error) {
      app.log.error(
        { error, sessionId: session.id },
        "Failed to ensure workspace before evaluation"
      );
      return reply.code(503).send({
        message: "Workspace is unavailable. Retry in a moment."
      });
    }

    try {
      assertionResults = await workspaceManager.evaluateWorkspace(session);
    } catch (error) {
      app.log.error(
        { error, sessionId: session.id, scenarioId: session.scenarioId },
        "Scenario evaluator failed"
      );
      assertionResults = [
        {
          checkId: "evaluator_runtime",
          passed: false,
          explanation:
            "The evaluator could not run against the workspace snapshot. Submission was marked failed.",
          weight: 100
        }
      ];
    }
  }

  const submitResult = await repository.submitSession(
    id,
    user.id,
    assertionResults
  );

  if (!submitResult) {
    return reply.code(404).send({ message: "Session not found or unavailable" });
  }

  const response: SubmitSessionResponse = {
    attempt: submitResult.attempt,
    session: submitResult.session
  };

  try {
    await workspaceManager.stopWorkspace(id);
  } catch (error) {
    if (!(error instanceof WorkspaceProvisionError)) {
      app.log.warn({ error, sessionId: id }, "Workspace cleanup after submit failed");
    }
  }

  return response;
});

app.addHook("onClose", async () => {
  await repository.close();
});

async function start(): Promise<void> {
  try {
    await repository.init();
    await app.listen({
      host: config.host,
      port: config.port
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, "Shutting down");

  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

await start();
