import type {
  Attempt,
  CreateSessionResponse,
  RequestHintResponse,
  Scenario,
  Session,
  SubmitSessionResponse
} from "@gitarena/shared";

const API_BASE = "/api/v1";

export class ApiError<TPayload = unknown> extends Error {
  status: number;
  payload: TPayload;

  constructor(message: string, status: number, payload: TPayload) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export function isApiError<TPayload = unknown>(error: unknown): error is ApiError<TPayload> {
  return error instanceof ApiError;
}

async function parse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({ message: "Request failed" }));

  if (!response.ok) {
    const message =
      typeof payload.message === "string" && payload.message.length > 0
        ? payload.message
        : "Request failed";
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
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

export async function fetchScenarioAttempts(id: string): Promise<Attempt[]> {
  const response = await fetch(`${API_BASE}/scenarios/${id}/attempts`);
  const payload = await parse<{ attempts: Attempt[] }>(response);
  return payload.attempts;
}

export async function fetchUserHistory(): Promise<Attempt[]> {
  const response = await fetch(`${API_BASE}/users/me/history`);
  const payload = await parse<{ attempts: Attempt[] }>(response);
  return payload.attempts;
}

export async function fetchActiveSession(): Promise<Session | null> {
  const response = await fetch(`${API_BASE}/users/me/active-session`);
  const payload = await parse<{ session: Session | null }>(response);
  return payload.session;
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

export async function terminateSession(sessionId: string): Promise<Session> {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}`, {
    method: "DELETE"
  });
  const payload = await parse<{ session: Session }>(response);
  return payload.session;
}

export async function requestHint(sessionId: string): Promise<RequestHintResponse> {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}/hint`, {
    method: "POST"
  });

  return parse<RequestHintResponse>(response);
}

export async function submitSession(sessionId: string): Promise<SubmitSessionResponse> {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}/submit`, {
    method: "POST"
  });

  return parse<SubmitSessionResponse>(response);
}

export async function fetchSessionResult(
  sessionId: string
): Promise<SubmitSessionResponse> {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}/result`);
  return parse<SubmitSessionResponse>(response);
}
