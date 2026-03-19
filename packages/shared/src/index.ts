export type Difficulty = "beginner" | "intermediate" | "advanced";
export type ScenarioStatus = "draft" | "testing" | "published" | "deprecated";

export interface Scenario {
  id: string;
  title: string;
  description: string;
  objective: string;
  difficulty: Difficulty;
  estimatedTimeMinutes: number;
  tags: string[];
  status: ScenarioStatus;
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
}

export interface CreateSessionRequest {
  scenarioId: string;
}

export interface CreateSessionResponse {
  session: Session;
}
