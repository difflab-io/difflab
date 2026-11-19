# Development Guide

This monorepo uses `mise` for tool pinning and task execution and Premise (`premise.yaml`) for project scaffolding. Always run workspace and package tasks through `mise` rather than invoking global binaries directly.

## Worktree Isolation

Root `mise.toml` sets `DIFFLAB_HOME = "{{config_root}}/.tmp/difflab-home"`. Any command run under `mise` inside a checkout or linked Git worktree stores its SQLite database, daemon metadata, and templates inside `.tmp/difflab-home/` (git-ignored) and never reads or modifies `~/.difflab`. Automated test helpers also call `assertIsolatedTestHome()` from `libs/utils/src/testx.ts` to block accidental writes to `~/.difflab`.

## Common Tasks

| Goal                                                    | Command                            |
| ------------------------------------------------------- | ---------------------------------- |
| Install tools and workspace packages                    | `mise install && mise run install` |
| Build all apps and libraries                            | `mise run '//...:build'`           |
| Lint and type-check workspace + verify Protobuf codegen | `mise run '//...:lint'`            |
| Check formatting across workspace                       | `mise run '//...:format:check'`    |
| Run all unit, integration, and E2E tests                | `mise run '//...:test'`            |
| Run only end-to-end suites (`e2e/api` + `e2e/cli`)      | `mise run e2e`                     |

## Protobuf Code Generation

`apps/difflab-api/proto/difflab/v1/project.proto` is the source of truth for RPC messages, services, and `buf.validate` rules. After editing any `.proto` file, regenerate both server (`apps/difflab-api/src/gen/`) and private client (`libs/difflab-client-ts/src/gen/`) descriptors:

```sh
mise run //apps/difflab-api:codegen
```

`mise run //apps/difflab-api:lint` executes `codegen:check` to ensure committed descriptors match `buf generate`.

## Database Migrations

- **Local SQLite (`local` mode):** Starting `difflab up` (or running any RPC-backed CLI command) invokes `openLocalDifflabDb`, which creates `$DIFFLAB_HOME/local.sqlite` when absent, applies `shared` migrations automatically, and imports projects once from sibling `difflab.sqlite` if present.
- **Cloud PostgreSQL (`cloud` mode and Premise CI):** `difflab-api` never auto-migrates PostgreSQL at server startup. Premise's deployment lifecycle invokes `mise run //apps/difflab-api:migrate -- <environment>` (which resolves `DATABASE_URL` via `pm infra query` when unset and delegates to `mise run //libs/difflab-db:migrate`):

```sh
DATABASE_URL="postgres://user:pass@host:5432/difflab" mise run //apps/difflab-api:migrate
```

## Inspecting End-to-End Test Outputs

Running `mise run e2e` (or `mise run e2e:api` / `mise run e2e:cli`) creates deterministic per-test directories under `e2e/outputs/<suite>/<spec>/<test-slug>/` and keeps them on disk after passing and failing runs:

```sh
mise run e2e
cd e2e/outputs/cli/init/when-running-difflab-init--write-difflab-yaml-symlink-exclude-and-link-origin
cat cli.log      # exact CLI invocations, working directories, exit codes, stdout, stderr
cat api.log      # difflab-api LogTape JSONL startup + Connect HTTP request and response bodies
ls -la difflab-home/ workspace/
```

See [../e2e/README.md](../e2e/README.md) for the full E2E directory layout and smoke commands.
