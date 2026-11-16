# Difflab End-to-End Suites

Top-level E2E journeys verify workflow orchestration across `difflab-app`, `difflab-flow-engine`, `difflab daemon`, `difflab flows`, Herdr sessions, and isolated Git worktrees.

## Suite Layout

- `e2e/common/` — shared `suiteConfig`, strict HTTP cassette replay (`cassette.ts`), isolated `TestHarness` (`target/e2e/`), deterministic MCP-backed step agent (`mock-agent.ts`), and headless CI `herdr-shim.ts` fallback.
- `e2e/recordings/` — recorded Linear GraphQL exchanges replayed offline during `e2e/app` runs.
- `e2e/app/` — Linear `Ready` task matching (`agent`, `labels`, `team`), `runs.trigger_key` deduplication, `autospec` orchestration, missing `mise.toml` fast-fail, and worktree commit isolation.
- `e2e/cli/` — `difflab daemon` (`up`, `status`, `down`, idempotent reuse) and `difflab flows` (`run`, `list`, `status`, `logs --follow`) driving local `autoreview`.
- `e2e/web/` — Playwright browser verification (`1120x640`) of live SSE updates and Herdr badges in `difflab-app`.
- `e2e/outputs/` — git-ignored human-verifiable output artifacts (`FLOW.md`, `PLAN.md`, `REVIEW.md`, `logs.txt`, `worktree-git-log.txt`, `locations.json`, CLI `.log` transcripts, and UI screenshots).

## Commands

```bash
mise run e2e:fixtures:test
mise run e2e:smoke
mise run e2e
mise run e2e:app
mise run e2e:cli
mise run e2e:web
mise run e2e:list
```
