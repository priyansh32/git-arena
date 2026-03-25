import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import {
  CSRF_HEADER_NAME,
  type AssertionResult,
  type AuthUserResponse,
  type CreateSessionRequest,
  type CreateSessionResponse,
  type CurrentUserResponse,
  type RequestHintResponse,
  type Session,
  type SubmitSessionResponse,
  type UserProfile
} from "@gitarena/shared";
import { z } from "zod";

import {
  createSessionToken,
  hashSessionToken,
  parseCookieHeader,
  tokenEquals,
  verifyGoogleIdToken
} from "./auth.js";
import { loadConfig } from "./config.js";
import { Repository } from "./repository.js";
import { SessionMonitor } from "./session-monitor.js";
import {
  WorkspaceManager,
  WorkspaceProvisionError
} from "./workspace-manager.js";
import { buildDefaultWorkspaceSpec } from "./workspace/spec.js";

declare module "fastify" {
  interface FastifyRequest {
    user: UserProfile | null;
    sessionTokenHash: string | null;
    csrfToken: string | null;
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
const workspaceSpec = buildDefaultWorkspaceSpec({
  image: config.workspace.imageOverride
});
const repository = new Repository(config.databaseUrl);
const workspaceManager = new WorkspaceManager(config.workspace, workspaceSpec);
const testAllowedEmailSet = new Set(config.auth.testAllowedEmails);

const app = Fastify({
  logger: {
    level: config.nodeEnv === "production" ? "info" : "debug"
  }
});

interface WebsocketLike {
  OPEN: number;
  readyState: number;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  ping?: () => void;
  terminate?: () => void;
  on?: (event: string, listener: (...args: any[]) => void) => void;
}

const sessionSockets = new Map<string, Set<WebsocketLike>>();
const websocketActivityMs = new Map<string, number>();
const commandBuffersBySession = new Map<string, string>();
const WEBSOCKET_HEARTBEAT_INTERVAL_MS = 25_000;
const WEBSOCKET_HEARTBEAT_MISS_THRESHOLD = 2;

function logAuditEvent(
  session: Session,
  eventType: string,
  details: Record<string, unknown> = {}
): void {
  app.log.info({
    timestamp: new Date().toISOString(),
    session_id: session.id,
    user_id: session.userId,
    scenario_id: session.scenarioId,
    event_type: eventType,
    ...details
  });
}

function noteWebsocketActivity(sessionId: string): void {
  websocketActivityMs.set(sessionId, Date.now());
}

function getLastWebsocketActivityMs(sessionId: string): number | null {
  return websocketActivityMs.get(sessionId) ?? null;
}

function registerSocket(sessionId: string, socket: WebsocketLike): void {
  const sockets = sessionSockets.get(sessionId);
  if (sockets) {
    sockets.add(socket);
    return;
  }

  sessionSockets.set(sessionId, new Set([socket]));
}

function unregisterSocket(sessionId: string, socket: WebsocketLike): void {
  const sockets = sessionSockets.get(sessionId);
  if (!sockets) {
    return;
  }

  sockets.delete(socket);
  if (sockets.size === 0) {
    sessionSockets.delete(sessionId);
  }
}

function clearSessionTracking(sessionId: string): void {
  sessionSockets.delete(sessionId);
  websocketActivityMs.delete(sessionId);
  commandBuffersBySession.delete(sessionId);
}

function notifyAndCloseSessionSocket(sessionId: string, message: string): void {
  const sockets = sessionSockets.get(sessionId);
  if (sockets && sockets.size > 0) {
    for (const socket of sockets.values()) {
      if (socket.readyState !== socket.OPEN) {
        continue;
      }

      socket.send(`\r\n${message}\r\n`);
      socket.close(1000, message);
    }
  }

  clearSessionTracking(sessionId);
}

function decodeSocketMessage(data: unknown): { raw: Buffer; text: string } | null {
  if (typeof data === "string") {
    const raw = Buffer.from(data, "utf8");
    return { raw, text: data };
  }

  if (Array.isArray(data)) {
    const chunks = data.map((chunk) => {
      if (Buffer.isBuffer(chunk)) {
        return chunk;
      }
      if (chunk instanceof ArrayBuffer) {
        return Buffer.from(chunk);
      }
      return Buffer.from(chunk as string);
    });
    const raw = Buffer.concat(chunks);
    return { raw, text: raw.toString("utf8") };
  }

  if (data instanceof ArrayBuffer) {
    const raw = Buffer.from(data);
    return { raw, text: raw.toString("utf8") };
  }

  if (Buffer.isBuffer(data)) {
    return { raw: data, text: data.toString("utf8") };
  }

  return null;
}

function normalizeCommand(raw: string): string {
  const withoutAnsi = raw.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");
  const withoutBackspaces = withoutAnsi.replace(/.\u0008/g, "");
  return withoutBackspaces.replace(/\s+/g, " ").trim();
}

function detectMonitoredOperation(session: Session, command: string): void {
  const normalized = normalizeCommand(command);
  if (!normalized) {
    return;
  }

  if (/^find\s+\/\s+-type\s+f(\s|$)/.test(normalized)) {
    logAuditEvent(session, "session.anomaly_detected", {
      anomaly_type: "filesystem_enumeration",
      command: normalized
    });
    return;
  }

  if (/^cat\s+\/proc\/self\/status(\s|$)/.test(normalized)) {
    logAuditEvent(session, "session.anomaly_detected", {
      anomaly_type: "process_inspection",
      command: normalized
    });
    return;
  }

  if (/^git\s+config\s+--global(\s|$)/.test(normalized)) {
    logAuditEvent(session, "session.anomaly_detected", {
      anomaly_type: "global_git_config_update",
      command: normalized
    });
  }
}

function trackCommandsFromSocketInput(session: Session, chunk: string): void {
  const previousBuffer = commandBuffersBySession.get(session.id) ?? "";
  let pending = previousBuffer + chunk;

  while (true) {
    const newlineIndex = pending.search(/[\r\n]/);
    if (newlineIndex < 0) {
      break;
    }

    const command = pending.slice(0, newlineIndex);
    detectMonitoredOperation(session, command);
    pending = pending.slice(newlineIndex + 1);
  }

  if (pending.length > 4096) {
    pending = pending.slice(-4096);
  }

  commandBuffersBySession.set(session.id, pending);
}

const sessionMonitor = new SessionMonitor({
  repository,
  workspaceManager,
  monitoringLimits: workspaceSpec.monitoring,
  logger: app.log,
  getLastWebsocketActivityMs,
  notifyAndCloseSessionSocket
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
  credentials: true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", CSRF_HEADER_NAME],
  maxAge: 86_400
});
await app.register(cookie);
await app.register(websocket);

app.decorateRequest("user", null);
app.decorateRequest("sessionTokenHash", null);
app.decorateRequest("csrfToken", null);

app.addHook("onRequest", async (request, reply) => {
  request.user = null;
  request.sessionTokenHash = null;
  request.csrfToken = null;

  const sessionToken = request.cookies[config.auth.sessionCookieName];
  if (!sessionToken) {
    return;
  }

  const tokenHash = hashSessionToken(sessionToken);
  const authSession = await repository.getAuthSessionByTokenHash(tokenHash);
  if (!authSession) {
    reply.clearCookie(config.auth.sessionCookieName, sessionCookieOptions);
    return;
  }

  request.sessionTokenHash = tokenHash;
  request.user = authSession.user;
  request.csrfToken = authSession.csrfToken;
});

function requiresCsrfCheck(request: FastifyRequest): boolean {
  const method = request.method.toUpperCase();
  if (method !== "POST" && method !== "PUT" && method !== "PATCH" && method !== "DELETE") {
    return false;
  }

  if (request.url.startsWith("/api/v1/auth/google")) {
    return false;
  }

  return true;
}

function readCsrfHeader(request: FastifyRequest): string | null {
  const raw = request.headers[CSRF_HEADER_NAME];
  if (typeof raw === "string") {
    return raw.trim();
  }

  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string") {
    return raw[0].trim();
  }

  return null;
}

app.addHook("preHandler", async (request, reply) => {
  if (!requiresCsrfCheck(request) || !request.user) {
    return;
  }

  const expectedToken = request.csrfToken;
  const suppliedToken = readCsrfHeader(request);

  if (!expectedToken || !suppliedToken || !tokenEquals(expectedToken, suppliedToken)) {
    return reply.code(403).send({ message: "Invalid or missing CSRF token" });
  }
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
    app.log.warn({ err: error }, "Rejected invalid Google ID token");
    return reply.code(401).send({ message: "Invalid Google ID token" });
  }

  if (config.auth.testMode) {
    const normalizedEmail = identity.email.toLowerCase();
    if (!testAllowedEmailSet.has(normalizedEmail)) {
      app.log.info(
        { email: normalizedEmail },
        "Blocked Google login in test mode for non-allowlisted email"
      );
      return reply.code(403).send({ message: "This test environment is invite-only" });
    }
  }

  const user = await repository.upsertGoogleUser(identity);
  const sessionToken = createSessionToken();
  const csrfToken = createSessionToken();
  const tokenHash = hashSessionToken(sessionToken);
  const expiresAt = new Date(Date.now() + sessionCookieMaxAgeSeconds * 1000);

  await repository.createAuthSession({
    userId: user.id,
    tokenHash,
    csrfToken,
    expiresAt,
    userAgent: request.headers["user-agent"] ?? null,
    ipAddress: request.ip ?? null
  });

  reply.setCookie(config.auth.sessionCookieName, sessionToken, {
    ...sessionCookieOptions,
    maxAge: sessionCookieMaxAgeSeconds
  });

  const response: AuthUserResponse = { user, csrfToken };
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
    user: request.user,
    csrfToken: request.user ? request.csrfToken : null
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
  const scenarioRuntime = await repository.getScenarioRuntimeForSession(session.id);
  if (!scenarioRuntime) {
    app.log.error(
      { sessionId: session.id, scenarioId: session.scenarioId },
      "Missing scenario runtime for newly created session"
    );
    await repository.terminateSession(session.id, user.id);
    return reply.code(500).send({
      message: "Scenario runtime is not available. Contact support."
    });
  }
  try {
    await workspaceManager.ensureWorkspace(session, scenarioRuntime);
  } catch (error) {
    app.log.error(
      { error, sessionId: session.id },
      "Failed to provision workspace container"
    );
    await repository.terminateSession(session.id, user.id);

    const message =
      config.workspace.provider === "kubernetes"
        ? "Unable to provision workspace pod. Cold starts may take a few moments. Retry shortly."
        : "Unable to provision workspace container. Retry shortly.";

    return reply.code(503).send({ message });
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
    const scenarioRuntime = await repository.getScenarioRuntimeForSession(session.id);
    if (!scenarioRuntime) {
      app.log.error(
        { sessionId: session.id, scenarioId: session.scenarioId },
        "Missing scenario runtime while ensuring session workspace"
      );
      return reply.code(503).send({
        message: "Workspace is unavailable. Retry in a moment."
      });
    }
    try {
      await workspaceManager.ensureWorkspace(session, scenarioRuntime);
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
  const socket = (connection?.socket ?? connection) as WebsocketLike | undefined;

  if (!socket) {
    app.log.warn(
      {
        hasConnection: Boolean(connection),
        hasSocket: Boolean(connection?.socket ?? connection),
        path: request?.url
      },
      "Websocket connection missing socket handle; dropping initialization"
    );
    return;
  }

  void (async () => {
    const { id } = paramsSchema.parse(request.params);
    const { token } = wsQuerySchema.parse(request.query);
    const cookies = parseCookieHeader(request.headers?.cookie);
    const sessionToken = cookies[config.auth.sessionCookieName];

    if (!sessionToken) {
      socket.close(1008, "Authentication required");
      return;
    }

    const authSession = await repository.getAuthSessionByTokenHash(
      hashSessionToken(sessionToken)
    );
    if (!authSession) {
      socket.close(1008, "Authentication required");
      return;
    }

    const user = authSession.user;
    const session = await repository.getSessionById(id);
    if (!session || session.userId !== user.id) {
      socket.close(1008, "Session not found");
      return;
    }

    if (session.wsToken !== token) {
      socket.close(1008, "Invalid token");
      return;
    }

    if (session.status !== "active" && session.status !== "submitted") {
      socket.close(1008, "Session is closed");
      return;
    }

    const scenarioRuntime = await repository.getScenarioRuntimeForSession(session.id);
    if (!scenarioRuntime) {
      socket.close(1011, "Scenario runtime unavailable");
      return;
    }

    try {
      await workspaceManager.ensureWorkspace(session, scenarioRuntime);
    } catch (error) {
      app.log.error(
        { error, sessionId: session.id },
        "Failed to ensure workspace before terminal attach"
      );
      socket.close(1011, "Workspace unavailable");
      return;
    }

    const hadPreviousActivity = websocketActivityMs.has(session.id);
    noteWebsocketActivity(session.id);
    logAuditEvent(
      session,
      hadPreviousActivity ? "session.ws_reconnected" : "session.ws_connected"
    );
    registerSocket(session.id, socket);

    const terminal = workspaceManager.openTerminal(session.id);
    let missedPongCount = 0;
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let sawTerminalOutput = false;
    let promptKickTimeout: NodeJS.Timeout | null = null;

    const writeToSocket = (chunk: Buffer): void => {
      if (socket.readyState === socket.OPEN) {
        sawTerminalOutput = true;
        noteWebsocketActivity(session.id);
        socket.send(chunk.toString("utf8"));
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
      if (socket.readyState === socket.OPEN) {
        socket.send("\r\n[terminal unavailable]\r\n");
        socket.close(1011, "Terminal unavailable");
      }
    });

    terminal.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      app.log.info(
        { sessionId: session.id, code, signal },
        "Terminal process exited"
      );

      if (socket.readyState === socket.OPEN) {
        const closeReason =
          code === 0
            ? "Terminal closed"
            : `Terminal exited (code=${code ?? "unknown"}, signal=${signal ?? "none"})`;
        socket.send(`\r\n[${closeReason}]\r\n`);
        socket.close(code === 0 ? 1000 : 1011, closeReason);
      }
    });

    if (typeof socket.ping === "function") {
      socket.on?.("pong", () => {
        missedPongCount = 0;
      });

      heartbeatInterval = setInterval(() => {
        if (socket.readyState !== socket.OPEN) {
          return;
        }

        missedPongCount += 1;
        if (missedPongCount > WEBSOCKET_HEARTBEAT_MISS_THRESHOLD) {
          app.log.warn(
            { sessionId: session.id },
            "WebSocket heartbeat missed pong threshold; terminating stale connection"
          );
          socket.terminate?.();
          return;
        }

        socket.ping?.();
      }, WEBSOCKET_HEARTBEAT_INTERVAL_MS);
    }

    socket.on?.("message", (data: any) => {
      if (!terminal.stdin.writable) {
        return;
      }

      const decoded = decodeSocketMessage(data);
      if (!decoded) {
        return;
      }

      noteWebsocketActivity(session.id);
      trackCommandsFromSocketInput(session, decoded.text);
      terminal.stdin.write(decoded.raw);
    });

    // Fallback prompt kick: only nudge the shell if it did not emit any output
    // shortly after attach. This avoids duplicate prompt lines.
    promptKickTimeout = setTimeout(() => {
      if (!sawTerminalOutput && terminal.stdin.writable) {
        terminal.stdin.write("\n");
      }
    }, 250);

    socket.on?.("close", () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      if (promptKickTimeout) {
        clearTimeout(promptKickTimeout);
      }
      unregisterSocket(session.id, socket);
      logAuditEvent(session, "session.ws_disconnected");

      if (!terminal.killed) {
        terminal.kill("SIGKILL");
      }
    });
  })().catch((error) => {
    app.log.error({ error }, "Websocket session initialization failed");
    if (socket.readyState === socket.OPEN) {
      socket.close(1011, "Terminal initialization failed");
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
  clearSessionTracking(id);

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
    const scenarioRuntime = await repository.getScenarioRuntimeForSession(session.id);
    if (!scenarioRuntime) {
      app.log.error(
        { sessionId: session.id, scenarioId: session.scenarioId },
        "Missing scenario runtime while submitting session"
      );
      return reply.code(503).send({
        message: "Workspace evaluator is unavailable. Try again shortly."
      });
    }
    try {
      await workspaceManager.ensureWorkspace(session, scenarioRuntime);
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
      assertionResults = await workspaceManager.evaluateWorkspace(session, scenarioRuntime);
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
  clearSessionTracking(id);

  return response;
});

app.addHook("onClose", async () => {
  sessionMonitor.stop();
  await repository.close();
});

async function start(): Promise<void> {
  try {
    await repository.init();
    await app.listen({
      host: config.host,
      port: config.port
    });
    sessionMonitor.start();
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
