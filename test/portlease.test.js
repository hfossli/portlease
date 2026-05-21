"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { leasePort, prune, cacheDir } = require("../index.js");

async function withTempEnv(run) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "portlease-test-"));
  const prevCache = process.env.PORTLEASE_CACHE_DIR;
  const prevSkip = process.env.PORTLEASE_SKIP_PORT_CHECK;
  process.env.PORTLEASE_CACHE_DIR = path.join(tmp, "cache");
  process.env.PORTLEASE_SKIP_PORT_CHECK = "1";
  try {
    return await run(tmp);
  } finally {
    if (prevCache === undefined) delete process.env.PORTLEASE_CACHE_DIR;
    else process.env.PORTLEASE_CACHE_DIR = prevCache;
    if (prevSkip === undefined) delete process.env.PORTLEASE_SKIP_PORT_CHECK;
    else process.env.PORTLEASE_SKIP_PORT_CHECK = prevSkip;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

test("same directory gets the same port", async () => {
  await withTempEnv(async (tmp) => {
    const dir = fs.mkdtempSync(path.join(tmp, "wt-"));
    const a = await leasePort(3000, { cwd: dir });
    const b = await leasePort(3000, { cwd: dir });
    assert.strictEqual(a, 3000);
    assert.strictEqual(b, 3000);
  });
});

test("different directories get different ports", async () => {
  await withTempEnv(async (tmp) => {
    const d1 = fs.mkdtempSync(path.join(tmp, "wt1-"));
    const d2 = fs.mkdtempSync(path.join(tmp, "wt2-"));
    const p1 = await leasePort(3000, { cwd: d1 });
    const p2 = await leasePort(3000, { cwd: d2 });
    assert.notStrictEqual(p1, p2);
    assert.ok(p2 > p1);
  });
});

test("rejects out-of-range base ports", async () => {
  await withTempEnv(async () => {
    await assert.rejects(() => leasePort(80), /between 1024 and 65535/);
    await assert.rejects(() => leasePort("nope"), /between 1024 and 65535/);
  });
});

test("prune drops leases for missing directories", async () => {
  await withTempEnv(async (tmp) => {
    const dir = fs.mkdtempSync(path.join(tmp, "wt-"));
    await leasePort(4000, { cwd: dir });
    fs.rmSync(dir, { recursive: true, force: true });
    const removed = prune();
    assert.strictEqual(removed, 1);
    const leases = JSON.parse(fs.readFileSync(path.join(cacheDir(), "leases.json"), "utf8"));
    assert.deepStrictEqual(leases.leases, {});
  });
});

test("CLI prints a port", async () => {
  await withTempEnv((tmp) => {
    const dir = fs.mkdtempSync(path.join(tmp, "wt-"));
    const bin = path.join(__dirname, "..", "bin", "portlease.js");
    const out = execFileSync(process.execPath, [bin, "5000", "--cwd", dir], {
      encoding: "utf8",
      env: process.env,
    }).trim();
    assert.strictEqual(out, "5000");
  });
});
