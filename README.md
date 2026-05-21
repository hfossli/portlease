# portlease

Lease a stable, conflict-free TCP port for a directory. Run it twice from the
same directory and you get the same port back (as long as it is still free);
run it from a different directory and you get a different one. Useful for dev
servers, git worktrees, and parallel agents that each need their own port.

Works as a **CLI** and as a **JS library**.

## Install

```sh
npm install portlease          # as a dependency
npm install -g portlease       # as a global CLI
npx portlease 3000             # one-off, no install
```

## CLI

```sh
portlease 3000                 # prints a leased port at or above 3000
portlease 3000 --cwd /path     # key the lease to another directory
portlease --prune              # drop leases for directories that no longer exist
```

The port is printed to stdout, so it composes well in scripts:

```sh
PORT=$(portlease 3000)
my-server --port "$PORT"
```

### How it works

- The first lease for a directory finds the lowest free port at or above the
  base, skipping any port already leased to another directory.
- Repeat calls from the same directory return the same port while it stays free.
- Leases are stored in `~/.cache/portlease/leases.json` and guarded by a lock
  file, so concurrent callers won't collide.
- Leases for directories that no longer exist are pruned automatically on use.

## Library

```js
const { leasePort } = require("portlease");

const port = await leasePort(3000);                 // keyed to process.cwd()
const other = await leasePort(3000, { cwd: "/srv" });// keyed to another dir
```

### API

#### `leasePort(basePort, options?) => Promise<number>`

- `basePort` — lowest port to consider (1024–65535).
- `options.cwd` — directory the lease is keyed to (default: `process.cwd()`).
- `options.logger` — function called with diagnostic strings (e.g. `console.error`).

Returns the leased port.

#### `prune(options?) => number`

Removes leases for directories that no longer exist. Returns how many were
removed. `options.logger` is called per pruned entry.

#### `cacheDir() => string`

Returns the directory where leases are stored.

## Environment

| Variable | Effect |
| --- | --- |
| `PORTLEASE_CACHE_DIR` | Override the lease cache directory. |
| `PORTLEASE_SKIP_PORT_CHECK` | Set to `1` to skip the "is the port free" probe (useful in tests). |

## License

MIT
