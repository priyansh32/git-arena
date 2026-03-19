import websocket from "@fastify/websocket";
import cors from "@fastify/cors";
import Fastify from "fastify";
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  RequestHintResponse,
  SubmitSessionResponse
} from "@gitarena/shared";
import { z } from "zod";

import { loadConfig } from "./config.js";
import { Repository } from "./repository.js";
import {
  WorkspaceManager,
  WorkspaceProvisionError
} from "./workspace-manager.js";

const LOCAL_USER_ID = "local-dev-user";

const createSessionSchema = z.object({
  scenarioId: z.string().min(1)
});

const paramsSchema = z.object({
  id: z.string().min(1)
});

const wsQuerySchema = z.object({
  token: z.string().min(1)
});

const config = loadConfig();
const repository = new Repository(config.databaseUrl);
const workspaceManager = new WorkspaceManager(config.workspace);

const app = Fastify({
  logger: {
    level: config.nodeEnv === "production" ? "info" : "debug"
  }
});

await app.register(cors, {
  origin: config.corsOrigins,
  credentials: true
});
await app.register(websocket);

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
  const { id } = paramsSchema.parse(request.params);
  const scenario = await repository.getScenarioById(id);

  if (!scenario) {
    return reply.code(404).send({ message: "Scenario not found" });
  }

  const attempts = await repository.listAttemptsByScenario(LOCAL_USER_ID, id);
  return { attempts };
});

app.get("/api/v1/users/me/active-session", async () => {
  const session = await repository.getActiveSessionByUser(LOCAL_USER_ID);
  return { session };
});

app.get("/api/v1/users/me/history", async () => {
  const attempts = await repository.listAttemptsByUser(LOCAL_USER_ID);
  return { attempts };
});

app.post("/api/v1/sessions", async (request, reply) => {
  const payload = createSessionSchema.parse(request.body) as CreateSessionRequest;
  const scenario = await repository.getScenarioById(payload.scenarioId);

  if (!scenario || scenario.status !== "published") {
    return reply.code(404).send({ message: "Scenario not found or unavailable" });
  }

  const activeSession = await repository.getActiveSessionByUser(LOCAL_USER_ID);
  if (activeSession) {
    return reply.code(409).send({
      message: "Finish or quit your active session before starting another.",
      session: activeSession
    });
  }

  const session = await repository.createSession(LOCAL_USER_ID, payload.scenarioId);
  try {
    await workspaceManager.ensureWorkspace(session);
  } catch (error) {
    app.log.error(
      { error, sessionId: session.id },
      "Failed to provision workspace container"
    );
    await repository.terminateSession(session.id, LOCAL_USER_ID);

    return reply.code(503).send({
      message: "Unable to provision workspace container. Verify Docker is available."
    });
  }

  const response: CreateSessionResponse = { session };

  return reply.code(201).send(response);
});

app.get("/api/v1/sessions/:id", async (request, reply) => {
  const { id } = paramsSchema.parse(request.params);
  const session = await repository.getSessionById(id);

  if (!session || session.userId !== LOCAL_USER_ID) {
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

    const session = await repository.getSessionById(id);
    if (!session || session.userId !== LOCAL_USER_ID) {
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
  const { id } = paramsSchema.parse(request.params);
  const result = await repository.getSessionResult(id, LOCAL_USER_ID);

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
  const { id } = paramsSchema.parse(request.params);
  const terminatedSession = await repository.terminateSession(id, LOCAL_USER_ID);

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
  const { id } = paramsSchema.parse(request.params);
  const hintResult = await repository.requestHint(id, LOCAL_USER_ID);

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
  const { id } = paramsSchema.parse(request.params);
  const submitResult = await repository.submitSession(id, LOCAL_USER_ID);

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
