import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { getCommandPaths, getJaccountHome, getProfileDir, sanitizeProfileName } from "../../src/lib/paths.js";

test("getJaccountHome honors JACCOUNT_HOME", () => {
  assert.equal(getJaccountHome({ JACCOUNT_HOME: "/tmp/custom-jaccount" }), "/tmp/custom-jaccount");
});

test("profile names reject traversal", () => {
  assert.throws(() => sanitizeProfileName("../default"), /Invalid profile name/);
  assert.throws(() => sanitizeProfileName("default/path"), /Invalid profile name/);
});

test("profile directory stays under runtime profiles dir", () => {
  const profileDir = getProfileDir("default", "/tmp/jaccount-home");
  assert.equal(profileDir, path.join("/tmp/jaccount-home", "profiles", "default"));
});

test("command paths include run-specific artifact directory", () => {
  const paths = getCommandPaths("run-1", "/tmp/jaccount-home");
  assert.equal(paths.runArtifactDir, path.join("/tmp/jaccount-home", "artifacts", "run-1"));
  assert.equal(paths.runLogPath, path.join("/tmp/jaccount-home", "logs", "run-1.log"));
});
