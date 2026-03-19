import { randomUUID } from "node:crypto";

import type { Session } from "@gitarena/shared";

const sessions = new Map<string, Session>();

export function createSession(userId: string, scenarioId: string): Session {
  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + 30 * 60 * 1000);

  const session: Session = {
    id: randomUUID(),
    userId,
    scenarioId,
    status: "active",
    startedAt: startedAt.toISOString(),
    wsUrl: `/ws/sessions/${scenarioId}`,
    wsToken: randomUUID(),
    expiresAt: expiresAt.toISOString()
  };

  sessions.set(session.id, session);
  return session;
}

export function getSessionById(id: string): Session | undefined {
  return sessions.get(id);
}
