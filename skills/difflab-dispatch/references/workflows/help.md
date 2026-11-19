# Dispatch help and dry run

Supported requests:

- `dispatch <pr-or-branch> <files-or-slice>`: extract the approved slice into an isolated worktree via `on-request-worktree`, open a draft pull request with `### Automerge Checklist`, run `review new` and `review address`, automerge if all gates hold, and coordinate `/git rebase <base_ref>` in the source worktree.
- `dispatch [pr-or-branch]`: inspect the open pull request diff, propose self-contained candidate slices that build cleanly on `<base_ref>`, and ask the user which slice and custom checklist items to dispatch.
- `dispatch ... --remote`: run the dispatch workflow in a remote agent environment configured through `on-remote-delegation`.
- Dry-run request: resolve the source pull request, `<base_ref>`, candidate slice files, hook path (`~/.difflab/hooks/on-request-worktree/HOOK.md` or `on-remote-delegation/HOOK.md`), target branch `dispatch/<source-slug>-<slice-slug>`, and intended `### Automerge Checklist`, then stop without creating a worktree, branch, commit, or pull request.

Dry-run example:

```text
Request: "dispatch libs/difflab-db and libs/utils from PR #18 --dry-run"
Source: PR #18 (feature/mcp-sync-prep -> main)
Approved slice: libs/utils/**, libs/difflab-db/**, docs/architecture/difflab-db/** (+ premise.yaml registration)
Hook: ~/.difflab/hooks/on-request-worktree/HOOK.md
Target branch: dispatch/mcp-sync-prep-difflab-db (from origin/main)
Would port slice, open draft PR with Automerge Checklist, run review new + address, and merge only if all 4 standard gates pass. No worktree or branch created.
```
