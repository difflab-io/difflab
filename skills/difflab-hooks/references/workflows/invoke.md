# `hooks invoke`

1. Resolve `<name>` matching `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$` and locate `~/.difflab/hooks/<name>/HOOK.md`. Reject symlinks and path traversal.
2. When `~/.difflab/hooks/<name>/HOOK.md` is absent:
   - For `on-request-worktree` or `on-remote-delegation`: run [register](register.md) interactively first so the user picks a handler (`default` or custom), or stop and report the missing hook in non-interactive background runs.
   - For `on-merge` and other event hooks: treat automatic skill invocation as a no-op, or report the missing file and offer `hooks register <name>` when invoked directly by the user.
3. Read `~/.difflab/hooks/<name>/HOOK.md`, inspect `## Trigger`, `## Action`, and `## Instructions`, and bind caller inputs into `Receives`.
4. Make sure that the declared `Handler` and `Requires` permissions are supported and authorized in the current session. Ask before running any unauthorized side-effecting step.
5. Execute the handler and report the hook path, handler, and outcome.
