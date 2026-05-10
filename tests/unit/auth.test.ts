import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLoginMethod } from "../../src/commands/auth.js";

test("normalizeLoginMethod defaults to qr", () => {
  assert.equal(normalizeLoginMethod(undefined), "qr");
  assert.equal(normalizeLoginMethod(""), "qr");
});

test("normalizeLoginMethod accepts known methods case-insensitively", () => {
  assert.equal(normalizeLoginMethod("QR"), "qr");
  assert.equal(normalizeLoginMethod(" manual "), "manual");
  assert.equal(normalizeLoginMethod("password"), "password");
});

test("normalizeLoginMethod rejects unknown methods", () => {
  assert.throws(() => normalizeLoginMethod("sms"), /Invalid login method/);
});
