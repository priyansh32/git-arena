import type {
  CreateSessionResponse,
  Scenario,
  Session
} from "@gitarena/shared";

const API_BASE = "/api/v1";

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(payload.message ?? "Request failed");
  }

  return (await response.json()) as T;
}

export async function fetchScenarios(): Promise<Scenario[]> {
  const response = await fetch(`${API_BASE}/scenarios`);
  const payload = await parse<{ scenarios: Scenario[] }>(response);
  return payload.scenarios;
}

export async function fetchScenario(id: string): Promise<Scenario> {
  const response = await fetch(`${API_BASE}/scenarios/${id}`);
  const payload = await parse<{ scenario: Scenario }>(response);
  return payload.scenario;
}

export async function createSession(scenarioId: string): Promise<Session> {
  const response = await fetch(`${API_BASE}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenarioId })
  });

  const payload = await parse<CreateSessionResponse>(response);
  return payload.session;
}

export async function fetchSession(id: string): Promise<Session> {
  const response = await fetch(`${API_BASE}/sessions/${id}`);
  const payload = await parse<{ session: Session }>(response);
  return payload.session;
}
