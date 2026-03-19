import type {
  Attempt,
  AuthUserResponse,
  CreateSessionResponse,
  CurrentUserResponse,
  GoogleAuthRequest,
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init
  });
  return parse<T>(response);
}

export async function fetchCurrentUser() {
  const payload = await request<CurrentUserResponse>("/users/me");
  return payload.user;
}

export async function loginWithGoogleIdToken(idToken: string) {
  const payload = await request<AuthUserResponse>("/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken } satisfies GoogleAuthRequest)
  });

  return payload.user;
}

export async function logoutUser(): Promise<void> {
  await request<{ ok: true }>("/auth/logout", {
    method: "POST"
  });
}

export async function fetchScenarios(): Promise<Scenario[]> {
  const payload = await request<{ scenarios: Scenario[] }>("/scenarios");
  return payload.scenarios;
}

export async function fetchScenario(id: string): Promise<Scenario> {
  const payload = await request<{ scenario: Scenario }>(`/scenarios/${id}`);
  return payload.scenario;
}

export async function fetchScenarioAttempts(id: string): Promise<Attempt[]> {
  const payload = await request<{ attempts: Attempt[] }>(`/scenarios/${id}/attempts`);
  return payload.attempts;
}

export async function fetchUserHistory(): Promise<Attempt[]> {
  const payload = await request<{ attempts: Attempt[] }>("/users/me/history");
  return payload.attempts;
}

export async function fetchActiveSession(): Promise<Session | null> {
  const payload = await request<{ session: Session | null }>("/users/me/active-session");
  return payload.session;
}

export async function createSession(scenarioId: string): Promise<Session> {
  const payload = await request<CreateSessionResponse>("/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenarioId })
  });
  return payload.session;
}

export async function fetchSession(id: string): Promise<Session> {
  const payload = await request<{ session: Session }>(`/sessions/${id}`);
  return payload.session;
}

export async function terminateSession(sessionId: string): Promise<Session> {
  const payload = await request<{ session: Session }>(`/sessions/${sessionId}`, {
    method: "DELETE"
  });
  return payload.session;
}

export async function requestHint(sessionId: string): Promise<RequestHintResponse> {
  return request<RequestHintResponse>(`/sessions/${sessionId}/hint`, {
    method: "POST"
  });
}

export async function submitSession(sessionId: string): Promise<SubmitSessionResponse> {
  return request<SubmitSessionResponse>(`/sessions/${sessionId}/submit`, {
    method: "POST"
  });
}

export async function fetchSessionResult(
  sessionId: string
): Promise<SubmitSessionResponse> {
  return request<SubmitSessionResponse>(`/sessions/${sessionId}/result`);
}
