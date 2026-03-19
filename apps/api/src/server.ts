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

const LOCAL_USER_ID = "local-dev-user";

const createSessionSchema = z.object({
  scenarioId: z.string().min(1)
});

const paramsSchema = z.object({
  id: z.string().min(1)
});

const config = loadConfig();
const repository = new Repository(config.databaseUrl);

const app = Fastify({
  logger: {
    level: config.nodeEnv === "production" ? "info" : "debug"
  }
});

await app.register(cors, {
  origin: config.corsOrigins,
  credentials: true
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

  const session = await repository.createSession(LOCAL_USER_ID, payload.scenarioId);
  const response: CreateSessionResponse = { session };

  return reply.code(201).send(response);
});

app.get("/api/v1/sessions/:id", async (request, reply) => {
  const { id } = paramsSchema.parse(request.params);
  const session = await repository.getSessionById(id);

  if (!session || session.userId !== LOCAL_USER_ID) {
    return reply.code(404).send({ message: "Session not found" });
  }

  return { session };
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
