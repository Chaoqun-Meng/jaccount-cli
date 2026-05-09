import assert from "node:assert/strict";
import test from "node:test";
import { parseDotEnv } from "../../src/lib/env.js";

test("parseDotEnv parses simple key values", () => {
  const parsed = parseDotEnv(`
    JACCOUNT_USERNAME=alice
    JACCOUNT_PASSWORD=secret
  `);

  assert.equal(parsed.JACCOUNT_USERNAME, "alice");
  assert.equal(parsed.JACCOUNT_PASSWORD, "secret");
});

test("parseDotEnv supports quotes and comments", () => {
  const parsed = parseDotEnv(`
    # ignored
    export JACCOUNT_HOME="/tmp/jaccount home"
    TOKEN='abc#123'
    INLINE=value # comment
  `);

  assert.equal(parsed.JACCOUNT_HOME, "/tmp/jaccount home");
  assert.equal(parsed.TOKEN, "abc#123");
  assert.equal(parsed.INLINE, "value");
});

