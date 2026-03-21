import assert from "node:assert/strict";
import test from "node:test";

import { parseAssertions } from "./workspace/parsing.js";

test("parseAssertions parses legacy PASS/FAIL evaluator output", () => {
  const assertions = parseAssertions(
    [
      "PASS:head_attached:HEAD is on a branch",
      "FAIL:clean_tree:Working tree is dirty",
      "PASS:remote_synced:origin/main is in sync",
      "SCORE:2/3"
    ].join("\n")
  );

  assert.equal(assertions.length, 3);
  assert.deepEqual(assertions[0], {
    checkId: "head_attached",
    passed: true,
    weight: 1,
    explanation: "HEAD is on a branch"
  });
  assert.deepEqual(assertions[1], {
    checkId: "clean_tree",
    passed: false,
    weight: 1,
    explanation: "Working tree is dirty"
  });
});

test("parseAssertions ignores ASSERT syntax output", () => {
  const assertions = parseAssertions(
    [
      "ASSERT:not_detached:PASS:30:HEAD is attached.",
      "ASSERT:tag_preserved:PASS:10:Tag v0.1 is present."
    ].join("\n")
  );

  assert.equal(assertions.length, 0);
});
