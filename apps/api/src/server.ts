import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import type { CreateSessionRequest, CreateSessionResponse } from "@gitarena/shared";

import { getScenarioById, listPublishedScenarios } from "./scenario-store.js";
import { createSession, getSessionById } from "./session-store.js";

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "0.0.0.0";

const createSessionSchema = z.object({
  scenarioId: z.string().min(1)
});

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: ["http://localhost:5173"],
  credentials: true
});

app.get("/api/v1/health", async () => ({ status: "ok" }));

app.get("/api/v1/scenarios", async () => {
  return { scenarios: listPublishedScenarios() };
});

app.get("/api/v1/scenarios/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const scenario = getScenarioById(id);

  if (!scenario) {
    return reply.code(404).send({ message: "Scenario not found" });
  }

  return { scenario };
});

app.post("/api/v1/sessions", async (request, reply) => {
  const parsed = createSessionSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({
      message: "Invalid request body",
      issues: parsed.error.issues
    });
  }

  const payload = parsed.data as CreateSessionRequest;
  const scenario = getScenarioById(payload.scenarioId);

  if (!scenario || scenario.status !== "published") {
    return reply.code(404).send({ message: "Scenario not found or unavailable" });
  }

  const session = createSession("local-dev-user", payload.scenarioId);
  const response: CreateSessionResponse = { session };

  return reply.code(201).send(response);
});

app.get("/api/v1/sessions/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const session = getSessionById(id);

  if (!session) {
    return reply.code(404).send({ message: "Session not found" });
  }

  return { session };
});

const start = async () => {
  try {
    await app.listen({ port: PORT, host: HOST });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();
