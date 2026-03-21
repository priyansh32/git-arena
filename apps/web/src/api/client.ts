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
import { CSRF_HEADER_NAME } from "@gitarena/shared";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";
let csrfToken: string | null = null;

function setCsrfToken(nextToken: string | null | undefined): void {
  if (!nextToken) {
    csrfToken = null;
    return;
  }

  const normalized = nextToken.trim();
  csrfToken = normalized.length > 0 ? normalized : null;
}

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
    if (response.status === 401) {
      setCsrfToken(null);
    }

    const message =
      typeof payload.message === "string" && payload.message.length > 0
        ? payload.message
        : "Request failed";
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers ?? undefined);

  if (
    csrfToken &&
    (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE")
  ) {
    headers.set(CSRF_HEADER_NAME, csrfToken);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers
  });
  return parse<T>(response);
}

export async function fetchCurrentUser() {
  const payload = await request<CurrentUserResponse>("/users/me");
  setCsrfToken(payload.csrfToken);
  return payload.user;
}

export async function loginWithGoogleIdToken(idToken: string) {
  const payload = await request<AuthUserResponse>("/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken } satisfies GoogleAuthRequest)
  });

  setCsrfToken(payload.csrfToken);
  return payload.user;
}

export async function logoutUser(): Promise<void> {
  try {
    await request<{ ok: true }>("/auth/logout", {
      method: "POST"
    });
  } finally {
    setCsrfToken(null);
  }
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
