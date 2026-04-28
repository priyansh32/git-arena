import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "./config.js";

const BASE_ENV = {
  GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
  SESSION_SECRET: "test-secret-that-is-at-least-32-characters-long"
};

test("loadConfig keeps test-mode gate disabled by default", () => {
  const config = loadConfig(BASE_ENV);

  assert.equal(config.auth.testMode, false);
  assert.deepEqual(config.auth.testAllowedEmails, []);
});

test("loadConfig enables test-mode gate with normalized allowlist", () => {
  const config = loadConfig({
    ...BASE_ENV,
    AUTH_TEST_MODE: "true",
    AUTH_TEST_ALLOWED_EMAILS: " One@Example.com, two@example.com ,one@example.com "
  });

  assert.equal(config.auth.testMode, true);
  assert.deepEqual(config.auth.testAllowedEmails, [
    "one@example.com",
    "two@example.com"
  ]);
});

test("loadConfig rejects AUTH_TEST_MODE=true without allowlist", () => {
  assert.throws(() =>
    loadConfig({
      ...BASE_ENV,
      AUTH_TEST_MODE: "true",
      AUTH_TEST_ALLOWED_EMAILS: ""
    }));
});
