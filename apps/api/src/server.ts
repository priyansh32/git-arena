import cors from "@fastify/cors";
import Fastify from "fastify";
import type { CreateSessionRequest, CreateSessionResponse } from "@gitarena/shared";
import { z } from "zod";

import { loadConfig } from "./config.js";
import { Repository } from "./repository.js";

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

app.post("/api/v1/sessions", async (request, reply) => {
  const payload = createSessionSchema.parse(request.body) as CreateSessionRequest;
  const scenario = await repository.getScenarioById(payload.scenarioId);

  if (!scenario || scenario.status !== "published") {
    return reply.code(404).send({ message: "Scenario not found or unavailable" });
  }

  const session = await repository.createSession("local-dev-user", payload.scenarioId);
  const response: CreateSessionResponse = { session };

  return reply.code(201).send(response);
});

app.get("/api/v1/sessions/:id", async (request, reply) => {
  const { id } = paramsSchema.parse(request.params);
  const session = await repository.getSessionById(id);

  if (!session) {
    return reply.code(404).send({ message: "Session not found" });
  }

  return { session };
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
