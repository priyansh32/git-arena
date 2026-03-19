import type { AssertionResult, Attempt } from "@gitarena/shared";

export interface EvaluationInput {
  objective: string;
  startedAt: Date;
  evaluatedAt: Date;
  estimatedTimeMinutes: number;
  hintCount: number;
  assertions?: AssertionResult[];
}

export interface EvaluationOutput {
  score: number;
  baseScore: number;
  timeBonus: number;
  hintPenalty: number;
  passed: boolean;
  assertions: AssertionResult[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getDefaultAssertions(objective: string, withinTimeWindow: boolean): AssertionResult[] {
  return [
    {
      checkId: "workspace_active",
      passed: true,
      explanation: "Workspace session is active and submission was received.",
      weight: 30
    },
    {
      checkId: "objective_submitted",
      passed: true,
      explanation: `Submission captured for objective: ${objective}`,
      weight: 40
    },
    {
      checkId: "within_time_window",
      passed: withinTimeWindow,
      explanation: withinTimeWindow
        ? "Submission was within expected time window."
        : "Submission exceeded expected scenario time window.",
      weight: 30
    }
  ];
}

function normalizeAssertion(assertion: AssertionResult): AssertionResult {
  const fallbackCheckId = assertion.checkId.trim().length > 0 ? assertion.checkId : "check";
  const fallbackExplanation =
    assertion.explanation.trim().length > 0
      ? assertion.explanation
      : "No explanation was provided by evaluator.";

  return {
    checkId: fallbackCheckId,
    passed: assertion.passed,
    explanation: fallbackExplanation,
    weight: clamp(Math.round(assertion.weight), 0, 100)
  };
}

export function evaluateSubmission(input: EvaluationInput): EvaluationOutput {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((input.evaluatedAt.getTime() - input.startedAt.getTime()) / 1000)
  );
  const timeLimitSeconds = Math.max(1, input.estimatedTimeMinutes * 60);
  const timeRemaining = Math.max(0, timeLimitSeconds - elapsedSeconds);
  const withinTimeWindow = timeRemaining > 0;

  const assertions =
    input.assertions && input.assertions.length > 0
      ? input.assertions.map(normalizeAssertion)
      : getDefaultAssertions(input.objective, withinTimeWindow);

  const rawBaseScore = assertions
    .filter((assertion) => assertion.passed)
    .reduce((total, assertion) => total + assertion.weight, 0);
  const baseScore = clamp(rawBaseScore, 0, 100);

  const timeBonus = Math.round((timeRemaining / timeLimitSeconds) * 20);
  const hintPenalty = Math.min(input.hintCount * 5, 20);
  const score = clamp(baseScore + timeBonus - hintPenalty, 0, 100);
  const passed = score >= 70;

  return {
    score,
    baseScore,
    timeBonus,
    hintPenalty,
    passed,
    assertions
  };
}

export function toAttemptInsert(input: EvaluationOutput): Pick<
  Attempt,
  "score" | "baseScore" | "timeBonus" | "hintPenalty" | "passed" | "assertions"
> {
  return {
    score: input.score,
    baseScore: input.baseScore,
    timeBonus: input.timeBonus,
    hintPenalty: input.hintPenalty,
    passed: input.passed,
    assertions: input.assertions
  };
}
