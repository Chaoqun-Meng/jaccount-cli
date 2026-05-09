import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../../src/lib/errors.js";
import { failureResult, successResult } from "../../src/lib/result.js";

test("successResult uses the stable schema", () => {
  const result = successResult({
    command: "doctor",
    runId: "run-1",
    profile: "default",
    data: { ok: true }
  });

  assert.equal(result.schemaVersion, "1.0");
  assert.equal(result.ok, true);
  assert.equal(result.command, "doctor");
  assert.equal(result.profile, "default");
  assert.deepEqual(result.artifacts, {
    screenshot: null,
    log: null,
    trace: null
  });
  assert.equal(result.error, null);
});

test("failureResult maps AppError to error payload", () => {
  const result = failureResult({
    command: "task open",
    runId: "run-2",
    profile: "default",
    error: new AppError("AUTH_REQUIRED", "Profile is not logged in", "login url")
  });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "AUTH_REQUIRED");
  assert.equal(result.error?.message, "Profile is not logged in");
  assert.equal(result.error?.detail, "login url");
});
