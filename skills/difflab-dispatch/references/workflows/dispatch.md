# `dispatch`

1. Parse optional `--remote`, `[pr-or-branch]`, and `[slice]` arguments, and resolve the absolute checkout root, `project_context` (`project_key` and `repo_slug`), open source pull request, and `<base_ref>`. When `[slice]` is omitted or ambiguous, inspect the source diff and review threads, propose self-contained slices that compile on `<base_ref>`, and ask the user to approve one slice and any extra automerge rules before mutating files. Snapshot `git diff <base_ref>...<source_head>` as the parity baseline and derive `<branch_name>` as `dispatch/<source-slug>-<slice-slug>`.
2. Provision an isolated checkout on `<branch_name>` starting at `<base_ref>` via [difflab-hooks](../../../difflab-hooks/SKILL.md): invoke `on-remote-delegation` when `--remote` is set, or invoke `on-request-worktree` otherwise.
3. In the dispatch checkout, run `plan new` via [difflab-plan](../../../difflab-plan/SKILL.md) (`YYMMDD-dispatch-<slice-slug>`) to plan porting the approved slice from `<source_head>` onto `<base_ref>` with minimal module wiring. Add the optional `## Automerge Checklist` section from [the automerge gates reference](../gates.md) (plus any approved slice conditions) to `PLAN.md`.
4. Run `plan go --commit` via [difflab-plan](../../../difflab-plan/SKILL.md) to port the slice hunks onto `<base_ref>`, apply module-resolution wiring, run workspace tasks (`mise.toml`), update live checkboxes and `logs.txt`, and create scoped commits.
5. Push `<branch_name>`, run `pr open` via [pr](../../../pr/SKILL.md) (`pr draft`) linking the source pull request and mirroring `## Automerge Checklist` under `## Validation`, wait for remote continuous integration to pass, and run one round of `review new` and `review address` via [difflab-review](../../../difflab-review/SKILL.md) (waiting for green continuous integration on any fix commit).
6. Evaluate every item in `## Automerge Checklist` in `PLAN.md` against [the automerge gates reference](../gates.md) and mark verified gates `[x]`. When all automerge gates pass and zero unresolved review threads remain, run `pr publish` and `pr merge` via [pr](../../../pr/SKILL.md), wait for post-merge `<base_ref>` continuous integration to pass, and coordinate `git rebase <base_ref>` via [git](../../../git/SKILL.md) in the source worktree when clean and idle. When any gate fails, leave the failing gate unchecked in `PLAN.md`, keep the pull request open without merging, and notify interactive users.

Dry run example:

```text
Request: "dispatch libs/difflab-db from PR #18 --dry-run"
Would invoke on-request-worktree for dispatch/mcp-sync-prep-difflab-db from origin/main.
Would scaffold .difflab/plans/261119-dispatch-difflab-db/PLAN.md with ## Automerge Checklist. No worktree, branch, or PR created.
```
