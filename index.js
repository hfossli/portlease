"use strict";

const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");

function cacheDir() {
  return (
    process.env.PORTLEASE_CACHE_DIR ||
    path.join(process.env.HOME || process.env.USERPROFILE || ".", ".cache", "portlease")
  );
}

function leaseFilePath() {
  return path.join(cacheDir(), "leases.json");
}

function lockFilePath() {
  return path.join(cacheDir(), "leases.lock");
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

function acquireLock() {
  const dir = cacheDir();
  const lockFile = lockFilePath();
  fs.mkdirSync(dir, { recursive: true });
  const maxAttempts = 50;
  const retryDelay = 100;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const fd = fs.openSync(lockFile, "wx");
      fs.writeFileSync(fd, String(process.pid));
      fs.closeSync(fd);
      return;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      try {
        const pid = Number(fs.readFileSync(lockFile, "utf8").trim());
        if (pid && !isProcessAlive(pid)) {
          fs.unlinkSync(lockFile);
          continue;
        }
      } catch {
        continue;
      }
      sleepSync(retryDelay);
    }
  }
  throw new Error(`Could not acquire lock after ${maxAttempts} attempts`);
}

function releaseLock() {
  try {
    fs.unlinkSync(lockFilePath());
  } catch {}
}

function readLeases() {
  try {
    return JSON.parse(fs.readFileSync(leaseFilePath(), "utf8"));
  } catch {
    return { leases: {} };
  }
}

function writeLeases(data) {
  fs.mkdirSync(cacheDir(), { recursive: true });
  fs.writeFileSync(leaseFilePath(), JSON.stringify(data, null, 2) + "\n");
}

function pruneLeases(data, { logger } = {}) {
  const next = { leases: {} };
  for (const [key, lease] of Object.entries(data.leases || {})) {
    const dir = lease.cwd || key;
    if (fs.existsSync(dir)) {
      next.leases[key] = lease;
    } else if (typeof logger === "function") {
      logger(`[portlease] pruned stale lease: ${dir} -> ${lease.port}`);
    }
  }
  return next;
}

function isPortFree(port) {
  if (String(process.env.PORTLEASE_SKIP_PORT_CHECK || "") === "1") {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}

function leasedPorts(data) {
  const ports = new Set();
  for (const lease of Object.values(data.leases || {})) {
    ports.add(lease.port);
  }
  return ports;
}

async function findPort(start, reserved) {
  let port = start;
  while (port <= 65535) {
    if (!reserved.has(port) && (await isPortFree(port))) return port;
    port++;
  }
  throw new Error(`No available port found starting from ${start}`);
}

function resolveCwd(cwd) {
  return fs.realpathSync(path.resolve(cwd || process.cwd()));
}

/**
 * Lease a stable port for a given working directory.
 *
 * Reuses the previously leased port if it is still free; otherwise finds the
 * next available port at or above `basePort`, avoiding ports already leased to
 * other directories. Leases for directories that no longer exist are pruned.
 *
 * @param {number} basePort  Lowest port to consider (1024-65535).
 * @param {object} [options]
 * @param {string} [options.cwd]     Directory the lease is keyed to (default: process.cwd()).
 * @param {function} [options.logger] Called with diagnostic strings (e.g. console.error).
 * @returns {Promise<number>} The leased port.
 */
async function leasePort(basePort, options = {}) {
  const base = Number(basePort);
  if (!Number.isInteger(base) || base < 1024 || base > 65535) {
    throw new Error("leasePort: basePort must be an integer between 1024 and 65535");
  }
  const cwd = resolveCwd(options.cwd);
  const logger = options.logger;

  acquireLock();
  try {
    let data = pruneLeases(readLeases(), { logger });

    const leaseKey = `${cwd}\t${base}`;
    const existing = data.leases[leaseKey];

    if (existing) {
      if (await isPortFree(existing.port)) {
        existing.updatedAt = new Date().toISOString();
        writeLeases(data);
        return existing.port;
      }
      delete data.leases[leaseKey];
    }

    const reserved = leasedPorts(data);
    const port = await findPort(base, reserved);

    data.leases[leaseKey] = {
      cwd,
      base,
      port,
      updatedAt: new Date().toISOString(),
    };
    writeLeases(data);
    return port;
  } finally {
    releaseLock();
  }
}

/** Remove leases whose directory no longer exists. Returns the pruned count. */
function prune({ logger } = {}) {
  acquireLock();
  try {
    const before = readLeases();
    const beforeCount = Object.keys(before.leases || {}).length;
    const after = pruneLeases(before, { logger });
    writeLeases(after);
    return beforeCount - Object.keys(after.leases || {}).length;
  } finally {
    releaseLock();
  }
}

module.exports = {
  leasePort,
  prune,
  cacheDir,
};
