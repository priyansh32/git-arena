export type Difficulty = "beginner" | "intermediate" | "advanced";
export type ScenarioStatus = "draft" | "testing" | "published" | "deprecated";
export const CSRF_HEADER_NAME = "x-gitarena-csrf";

export interface Scenario {
  id: string;
  title: string;
  description: string;
  objective: string;
  difficulty: Difficulty;
  estimatedTimeMinutes: number;
  tags: string[];
  hints: string[];
  status: ScenarioStatus;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  userId: string;
  scenarioId: string;
  status: "pending" | "active" | "submitted" | "evaluated" | "terminated";
  startedAt: string;
  wsUrl: string;
  wsToken: string;
  expiresAt: string;
  hintCount: number;
}

export interface CreateSessionRequest {
  scenarioId: string;
}

export interface CreateSessionResponse {
  session: Session;
}

export interface CreateSessionConflictResponse {
  message: string;
  session: Session;
}

export interface AssertionResult {
  checkId: string;
  passed: boolean;
  explanation: string;
  weight: number;
}

export interface Attempt {
  id: string;
  sessionId: string;
  userId: string;
  scenarioId: string;
  score: number;
  baseScore: number;
  timeBonus: number;
  hintPenalty: number;
  passed: boolean;
  assertions: AssertionResult[];
  evaluatedAt: string;
}

export interface SubmitSessionResponse {
  attempt: Attempt;
  session: Session;
}

export interface HintResponse {
  hintIndex: number;
  hint: string;
}

export interface RequestHintResponse extends HintResponse {
  session: Session;
}

export interface GoogleAuthRequest {
  idToken: string;
}

export interface AuthUserResponse {
  user: UserProfile;
  csrfToken: string;
}

export interface CurrentUserResponse {
  user: UserProfile | null;
  csrfToken: string | null;
}
