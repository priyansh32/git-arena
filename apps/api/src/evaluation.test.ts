import assert from "node:assert/strict";
import test from "node:test";

import { evaluateSubmission } from "./evaluation.js";

test("evaluateSubmission applies hint penalties and bonus", () => {
  const now = new Date("2026-03-19T18:45:00.000Z");
  const started = new Date("2026-03-19T18:40:00.000Z");

  const output = evaluateSubmission({
    objective: "Recover branch history",
    startedAt: started,
    evaluatedAt: now,
    estimatedTimeMinutes: 20,
    hintCount: 2
  });

  assert.equal(output.baseScore, 100);
  assert.equal(output.hintPenalty, 10);
  assert.ok(output.timeBonus > 0);
  assert.ok(output.score <= 100);
  assert.equal(output.passed, true);
});

test("evaluateSubmission fails time window when overdue", () => {
  const now = new Date("2026-03-19T19:30:00.000Z");
  const started = new Date("2026-03-19T18:00:00.000Z");

  const output = evaluateSubmission({
    objective: "Recover branch history",
    startedAt: started,
    evaluatedAt: now,
    estimatedTimeMinutes: 30,
    hintCount: 0
  });

  const timeAssertion = output.assertions.find(
    (assertion) => assertion.checkId === "within_time_window"
  );

  assert.ok(timeAssertion);
  assert.equal(timeAssertion?.passed, false);
  assert.equal(output.timeBonus, 0);
  assert.equal(output.baseScore, 70);
});
