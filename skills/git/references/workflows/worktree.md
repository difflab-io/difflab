# Branch and worktree

Create a branch, a linked worktree, or both only when requested. Confirm the repository, current branch, desired base, branch name, and destination. A worktree needs a named branch; ask if none can be inferred unambiguously. Check for an existing branch and an existing destination before changing anything. A branch already checked out in another worktree cannot be checked out here; report the owning worktree rather than bypassing Git's protection.

For a branch-only request, create it from the confirmed base if absent, or switch to it if it exists and the current worktree can switch safely. Do not create a worktree. For a worktree request, create or reuse the requested branch in the **new** worktree; leave the user's current worktree on its existing branch. Never silently move a branch already checked out elsewhere, overwrite a directory, or replace an existing worktree. Choose a destination only after checking repository conventions and obtaining confirmation when several paths are plausible. If neither action was requested, make no change.

Report the branch name, base, worktree path when created, and any blocked operation separately. This is guidance for existing Git behavior, not a wrapper or a new command. Adapted from Codevoyant's MIT-licensed worktree workflow; see [license](../../LICENSE.md).
