import assert from "node:assert/strict";
import test from "node:test";

import { evaluateSubmission } from "./evaluation.js";

test("evaluateSubmission passes only when all evaluator checks pass", () => {
  const now = new Date("2026-03-19T18:45:00.000Z");
  const started = new Date("2026-03-19T18:40:00.000Z");

  const output = evaluateSubmission({
    objective: "Recover branch history",
    startedAt: started,
    evaluatedAt: now,
    estimatedTimeMinutes: 20,
    hintCount: 2,
    assertions: [
      {
        checkId: "head_attached",
        passed: true,
        explanation: "HEAD is on a branch.",
        weight: 90
      },
      {
        checkId: "branch_exists",
        passed: true,
        explanation: "Expected branch exists.",
        weight: 10
      }
    ]
  });

  assert.equal(output.score, 2);
  assert.equal(output.baseScore, 2);
  assert.equal(output.hintPenalty, 0);
  assert.equal(output.timeBonus, 0);
  assert.equal(output.passed, true);
});

test("evaluateSubmission fails when any evaluator check fails", () => {
  const now = new Date("2026-03-19T19:30:00.000Z");
  const started = new Date("2026-03-19T18:00:00.000Z");

  const output = evaluateSubmission({
    objective: "Recover branch history",
    startedAt: started,
    evaluatedAt: now,
    estimatedTimeMinutes: 30,
    hintCount: 0,
    assertions: [
      {
        checkId: "head_attached",
        passed: true,
        explanation: "HEAD is on a branch.",
        weight: 1
      },
      {
        checkId: "branch_contains_work",
        passed: false,
        explanation: "Expected branch is missing work commits.",
        weight: 1
      },
      {
        checkId: "tag_preserved",
        passed: true,
        explanation: "v0.1 tag exists.",
        weight: 1
      }
    ]
  });

  assert.equal(output.score, 2);
  assert.equal(output.baseScore, 3);
  assert.equal(output.timeBonus, 0);
  assert.equal(output.hintPenalty, 0);
  assert.equal(output.passed, false);
});

test("evaluateSubmission provides fallback assertion when none are supplied", () => {
  const now = new Date("2026-03-19T18:05:00.000Z");
  const started = new Date("2026-03-19T18:00:00.000Z");

  const output = evaluateSubmission({
    objective: "Recover branch history",
    startedAt: started,
    evaluatedAt: now,
    estimatedTimeMinutes: 20,
    hintCount: 0
  });

  assert.equal(output.assertions.length, 1);
  assert.equal(output.assertions[0]?.checkId, "submission_received");
  assert.equal(output.score, 1);
  assert.equal(output.baseScore, 1);
  assert.equal(output.passed, true);
});
