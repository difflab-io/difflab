# Environment Configuration

Difflab centralizes path and environment variable parsing in `libs/difflab-config` and shared LogTape configuration in `libs/utils/src/logx.ts` to separate daily-driver user state (`~/.difflab`), worktree development state (`<worktree>/.tmp/difflab-home`), retained end-to-end test directories (`e2e/outputs/`), and cloud PostgreSQL deployments.

## State Directories and SQLite Coexistence

```text
~/.difflab/                             default when DIFFLAB_HOME is unset
├── difflab.sqlite                      untouched v0.13.0 database (read-only seed source)
├── local.sqlite                        v2 SQLite database owned by local difflab-api
├── daemon.json                         { pid, server_url, rpc_url, started_at }
├── api.log                             local background server log
├── templates/                          installed document templates and examples
└── projects/<KEY>/<repo-slug>/         plans, reviews, explorations, and flows
```

When `openLocalDifflabDb` inside `libs/difflab-db` creates `local.sqlite` for the first time and `difflab.sqlite` exists in the same directory, it opens `difflab.sqlite` read-only through `libs/difflab-db-legacy`, imports existing projects and Git remote links once, and leaves `difflab.sqlite` untouched so older `v0.13.0` CLI or MCP binaries continue working safely.

## Variables

### CLI, Client SDK, and Daemon (`libs/difflab-config`, `libs/difflab-daemon`, `libs/difflab-client-ts`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `DIFFLAB_HOME` | `~/.difflab` | State directory for `local.sqlite`, `daemon.json`, `templates/`, and `projects/`. Root `mise.toml` sets this to `{{config_root}}/.tmp/difflab-home` inside repository checkouts. |
| `DIFFLAB_RPC_URL` | unset (uses local daemon) | Remote Connect RPC base URL (for example `https://api.difflab.io/rpc`). When set, `resolveDifflabClient` skips starting a local daemon or creating `local.sqlite`. |
| `DIFFLAB_API_TOKEN` | unset | Bearer token sent in `Authorization: Bearer <token>` when `DIFFLAB_RPC_URL` is set. |
| `DIFFLAB_WORKSPACE` | unset | Workspace identifier sent in `x-difflab-workspace` when `DIFFLAB_RPC_URL` is set. |
| `DIFFLAB_DAEMON_LOG_PATH` | `$DIFFLAB_HOME/api.log` | Override log file path for spawned local daemon stdout and stderr. |
| `DIFFLAB_API_ENTRY` | auto-detected | Optional override path to the `difflab-api` server script when spawning the local daemon. |
| `DIFFLAB_LOG` | `warning` (`cli`), `info` (`api`) | LogTape level threshold (`debug`, `info`, `warn`, `warning`, `error`, or `fatal`) written to `stderr` so `stdout` stays clean for CLI and MCP output. |

### API Server (`apps/difflab-api`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `DIFFLAB_MODE` | `cloud` if `DATABASE_URL` is set, else `local` | Selects `local` (loopback SQLite) or `cloud` (Bearer auth + PostgreSQL). |
| `DATABASE_URL` | unset | PostgreSQL connection URL (`postgres://...`). Required in `cloud` mode and CI `migrate` runs. |
| `DIFFLAB_API_TOKEN` | unset | Shared secret verified in constant time against `Authorization: Bearer <token>`. Required in `cloud` mode; missing values abort startup before port binding. |
| `HOST` | `127.0.0.1` | Interface address bound by `difflab-api`. |
| `PORT` | `0` (`local`) or `8787` (`cloud`) | TCP port bound by `difflab-api` unless `--port` is passed. |
