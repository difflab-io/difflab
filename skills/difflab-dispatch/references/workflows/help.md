# Difflab dispatch help

Examples:

- "Dispatch `libs/difflab-db` from PR #18" -> provision a worktree via `on-request-worktree`, run `plan new` (with `## Automerge Checklist`) and `plan go --commit`, open and review the PR, automerge when gates pass, and rebase the clean source worktree.
- "Dispatch PR #18" -> inspect the PR diff, propose self-contained slices, and ask which slice and custom automerge rules to run.
- "Dispatch `libs/difflab-db` from PR #18 `--remote`" -> run the same workflow through `on-remote-delegation`.

Safety rules: resolve the initialized `.difflab` store first, ask when the source PR or slice is ambiguous, snapshot the source diff before porting, evaluate every gate in [the automerge gates reference](../gates.md) before `pr merge`, and leave the PR open if any gate fails.

Dry-run request: show the resolved source PR, `<base_ref>`, slice paths, hook path, target branch, and `PLAN.md` path without creating a worktree, branch, commit, or PR.
