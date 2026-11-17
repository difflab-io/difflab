# Difflab End-to-End Suites

Top-level E2E journeys verify workflow orchestration (`difflab-flow` via `/difflab-flow go` with `agy` as the default harness) across `difflab-app`, `difflab-flow-engine`, `difflab daemon`, `difflab flows`, Herdr sessions, and isolated Git worktrees.

## Suite Layout

- `e2e/common/` — shared `suiteConfig`, strict HTTP cassette replay (`cassette.ts`), isolated `TestHarness` (`target/e2e/` + `DIFFLAB_HOME_ROOT`), offline Git/GitHub CLI shims (`gh-shim.ts`), recorded `agy` workflow cassette replay (`flow-replay-runner.ts`), and headless CI `herdr-shim.ts` fallback.
- `e2e/recordings/` — recorded Linear GraphQL exchanges (`app/linear-ready-autospec.json`), recorded `agy` workflow cassettes (`app/autospec-linear-ready.json`, `cli/autoreview-local.json`), and verbatim snapshots of the user's `~/.difflab/flows/{autospec,autoreview}.md` for CI parity.
- `e2e/app/` — Linear `Ready` task matching (`agent`, `labels`, `team`), `runs.trigger_key` deduplication, `autospec` orchestration (`defaultHarness: agy`), missing `mise.toml` fast-fail, and worktree commit isolation.
- `e2e/cli/` — `difflab daemon` (`up`, `status`, `down`, idempotent reuse) and `difflab flows` (`run`, `list`, `status`, `logs --follow`) driving local `autoreview` (`defaultHarness: agy`).
- `e2e/web/` — Playwright browser verification (`1120x640`) of live SSE updates and Herdr badges in `difflab-app`.
- `e2e/outputs/` — git-ignored human-verifiable output artifacts (`FLOW.md`, `PLAN.md`, `REVIEW.md`, `rubric.yaml`, `logs.txt`, `gh-state.json`, `worktree-git-log.txt`, `locations.json`, CLI `.log` transcripts, and UI screenshots).

## Commands

```bash
mise run e2e:fixtures:test
mise run e2e:smoke
mise run e2e
DIFFLAB_E2E_EXTENDED=true mise run e2e:cli
DIFFLAB_E2E_EXTENDED=true mise run e2e:app
mise run e2e:web
mise run e2e:list
```
