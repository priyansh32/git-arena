import type { AssertionResult } from "@gitarena/shared";

const LEGACY_ASSERTION_LINE_PATTERN = /^(PASS|FAIL):([^:]+):(.*)$/;

export function parseAssertions(stdout: string): AssertionResult[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      const match = LEGACY_ASSERTION_LINE_PATTERN.exec(line);
      if (!match) {
        return null;
      }

      const [, status, rawCheckId, rawExplanation] = match;
      const checkId = rawCheckId.trim() || `check_${index + 1}`;
      const explanation = rawExplanation.trim();

      return {
        checkId,
        passed: status === "PASS",
        // Scoring is no longer weighted; we keep this field for compatibility.
        weight: 1,
        explanation
      } satisfies AssertionResult;
    })
    .filter((assertion): assertion is AssertionResult => assertion !== null);
}
