import type { AssertionResult } from "@gitarena/shared";

const ASSERTION_LINE_PATTERN = /^ASSERT:([^:]+):(PASS|FAIL):([0-9]+):(.*)$/;

export function parseAssertions(stdout: string): AssertionResult[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = ASSERTION_LINE_PATTERN.exec(line);
      if (!match) {
        return null;
      }

      const [, checkId, status, rawWeight, explanation] = match;
      const parsedWeight = Number.parseInt(rawWeight, 10);

      return {
        checkId,
        passed: status === "PASS",
        weight: Number.isFinite(parsedWeight) ? parsedWeight : 0,
        explanation
      } satisfies AssertionResult;
    })
    .filter((assertion): assertion is AssertionResult => assertion !== null);
}
