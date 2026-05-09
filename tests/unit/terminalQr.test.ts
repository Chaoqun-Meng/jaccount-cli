import assert from "node:assert/strict";
import test from "node:test";
import { renderTerminalQr } from "../../src/lib/terminalQr.js";

test("renderTerminalQr renders block QR text", () => {
  const rendered = renderTerminalQr("hello-jaccount");
  assert.match(rendered, /█/);
  assert.ok(rendered.length > 20);
});
