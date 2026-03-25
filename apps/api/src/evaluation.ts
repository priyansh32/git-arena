import type { AssertionResult, Attempt } from "@gitarena/shared";

export interface EvaluationInput {
  objective: string;
  assertions?: AssertionResult[];
}

export interface EvaluationOutput {
  score: number;
  baseScore: number;
  passed: boolean;
  assertions: AssertionResult[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getDefaultAssertions(objective: string): AssertionResult[] {
  return [
    {
      checkId: "submission_received",
      passed: true,
      explanation: `Submission captured for objective: ${objective}`,
      weight: 1
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
    // Scoring is test-case based; evaluator checks are treated uniformly.
    weight: 1
  };
}

export function evaluateSubmission(input: EvaluationInput): EvaluationOutput {
  const assertions =
    input.assertions && input.assertions.length > 0
      ? input.assertions.map(normalizeAssertion)
      : getDefaultAssertions(input.objective);

  const passedChecks = assertions.filter((assertion) => assertion.passed).length;
  const totalChecks = assertions.length;
  const score = clamp(passedChecks, 0, 100);
  const baseScore = clamp(totalChecks, 0, 100);
  const passed = totalChecks > 0 && passedChecks === totalChecks;

  return {
    score,
    baseScore,
    passed,
    assertions
  };
}

export function toAttemptInsert(input: EvaluationOutput): Pick<
  Attempt,
  "score" | "baseScore" | "passed" | "assertions"
> {
  return {
    score: input.score,
    baseScore: input.baseScore,
    passed: input.passed,
    assertions: input.assertions
  };
}
