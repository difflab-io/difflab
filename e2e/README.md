# Difflab End-to-End Tests

Outside-in end-to-end (E2E) tests exercise `difflab-api`, `difflab-cli`, and the `stdio` Model Context Protocol (MCP, a standard JSON-RPC protocol for coding agents) server as real OS subprocesses. Every test isolates `DIFFLAB_HOME` from `~/.difflab` and retains its output directory on disk after both passing and failing runs so you can inspect logs, SQLite files, symlinks, and scaffolded plans directly.

## Layout

```text
e2e/
├── common/
│   ├── test-harness.ts          per-test directory setup, subprocess runners, and PGlite socket helper
│   └── fixtures.ts              legacy v0.13.0 SQLite seeder and Git repository/worktree builders
├── api/
│   ├── migrations.spec.ts       local SQLite auto-migration, one-shot legacy seed, and PostgreSQL migrate
│   ├── auth.spec.ts             cloud Bearer token + x-difflab-workspace gates vs local loopback mode
│   └── project-service.spec.ts  CreateProject, ListProjects, GetProject, and LinkRepository RPCs
├── cli/
│   ├── help.spec.ts             bare difflab, --help, and --version without creating local.sqlite
│   ├── projects.spec.ts         local in-process SQLite and remote DIFFLAB_RPC_URL project commands
│   ├── init.spec.ts             repository linking, .difflab symlinks, Git excludes, and worktrees
│   ├── templates.spec.ts        template installation, scaffolding, and path/overwrite guards
│   └── mcp.spec.ts              mcp setup and all nine stdio MCP tools
└── outputs/<suite>/<spec>/<test-slug>/   retained git-ignored artifacts per test
    ├── cli.log                  CLI commands, exit codes, stdout/stderr, and MCP JSON-RPC payloads
    ├── api.log                  difflab-api startup events and Connect HTTP request/response JSON
    ├── difflab-home/            isolated DIFFLAB_HOME (local.sqlite, templates/, projects/<KEY>/<slug>/)
    └── workspace/               Git repositories, worktrees, difflab.yaml, .difflab, and PLAN.md files
```

## Running Tests

| Task | Command | Purpose |
| --- | --- | --- |
| Full E2E suite | `mise run e2e` | Run all `e2e/api` and `e2e/cli` specs. |
| API suite | `mise run e2e:api` | Run Connect RPC, auth, and migration specs. |
| CLI suite | `mise run e2e:cli` | Run CLI subcommand and `stdio` MCP specs. |
| Smoke check | `mise run e2e:smoke` | Run fast help, projects, and project-service smoke specs. |
| List specs | `mise run e2e:list` | Print all E2E `.spec.ts` files. |

## Inspecting Retained Test Directories

Each test recreates `e2e/outputs/<suite>/<spec>/<test-slug>/` before running, stops spawned background processes in `afterEach`, and leaves all files intact. Change into any test directory after a run to inspect its artifacts:

```sh
cd e2e/outputs/cli/init/init--write-config-symlink-exclude-and-link-origin
cat cli.log
cat api.log
ls -la workspace/repo/.difflab/plans/261119-demo/PLAN.md
```
