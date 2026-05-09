import assert from "node:assert/strict";
import test from "node:test";
import { findEntry, type EntryConfig } from "../../src/lib/entryConfig.js";

const config: EntryConfig = {
  entries: {
    graduate: {
      name: "研究生系统",
      matchText: "研究生"
    }
  }
};

test("findEntry matches by key", () => {
  const found = findEntry(config, "graduate");
  assert.equal(found.key, "graduate");
  assert.equal(found.entry.name, "研究生系统");
});

test("findEntry matches by display name", () => {
  const found = findEntry(config, "研究生系统");
  assert.equal(found.key, "graduate");
});

test("findEntry throws for unknown entries", () => {
  assert.throws(() => findEntry(config, "missing"), /Entry not found/);
});
