import assert from "node:assert/strict";
import test from "node:test";

import { createSessionToken, tokenEquals } from "./auth.js";

test("createSessionToken returns non-empty unpredictable tokens", () => {
  const tokenA = createSessionToken();
  const tokenB = createSessionToken();

  assert.ok(tokenA.length > 40);
  assert.ok(tokenB.length > 40);
  assert.notEqual(tokenA, tokenB);
});

test("tokenEquals returns true for identical tokens", () => {
  const token = createSessionToken();
  assert.equal(tokenEquals(token, token), true);
});

test("tokenEquals returns false for mismatched tokens", () => {
  const token = createSessionToken();
  assert.equal(tokenEquals(token, `${token}-tampered`), false);
});
