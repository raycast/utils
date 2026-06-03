import assert from "node:assert/strict";
import test from "node:test";

import { exec } from "./exec";

// `npm` is a `.cmd` shim on Windows and a real binary elsewhere. Resolving it proves cross-spawn's
// PATHEXT lookup works: pre-fix, `spawn("npm", …)` throws ENOENT on Windows runners.
test("exec resolves a .cmd shim on Windows (npm)", async () => {
  const output = await exec("npm", ["--version"]);
  assert.match(output, /^\d+\.\d+\.\d+/);
});

test("exec runs a real binary (node)", async () => {
  const output = await exec("node", ["--version"]);
  assert.match(output, /^v\d+\.\d+\.\d+/);
});

test("exec parses a command string into file and args", async () => {
  const output = await exec("node --version");
  assert.match(output, /^v\d+\.\d+\.\d+/);
});

test("exec returns a Buffer when encoding is 'buffer'", async () => {
  const output = await exec("node", ["--version"], { encoding: "buffer" });
  assert.ok(Buffer.isBuffer(output));
});

test("exec throws on a non-zero exit code", async () => {
  await assert.rejects(() => exec("node", ["-e", "process.exit(1)"]));
});
