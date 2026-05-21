#!/usr/bin/env node
"use strict";

const { leasePort, prune } = require("../index.js");

function usage() {
  console.log(`portlease <base_port> [--cwd <path>]
portlease --prune

Leases a stable TCP port at or above <base_port>, keyed to a directory.
Reuses the previous port for that directory when it is still free, and
avoids ports already leased to other directories. Prints the port to stdout.

Options:
  --cwd <path>   Directory the lease is keyed to (default: current directory)
  --prune        Remove leases for directories that no longer exist, then exit
  -h, --help     Show this help

Environment:
  PORTLEASE_CACHE_DIR        Override the lease cache directory
  PORTLEASE_SKIP_PORT_CHECK  Set to 1 to skip the "is port free" probe (tests)`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("-h") || args.includes("--help")) {
    usage();
    return;
  }

  if (args.includes("--prune")) {
    prune({ logger: (m) => console.error(m) });
    return;
  }

  let cwd = process.cwd();
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--cwd" && args[i + 1]) {
      cwd = args[i + 1];
      i++;
    }
  }

  const port = await leasePort(args[0], { cwd, logger: (m) => console.error(m) });
  console.log(port);
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
