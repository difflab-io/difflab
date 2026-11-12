# Invoke a hook

1. Validate the requested hook name against `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$` and locate `~/.difflab/hooks/<name>/HOOK.md`. Reject symlinks or path traversal.
2. If invoked automatically by a lifecycle event (such as `on-merge` from `/pr merge`) and `~/.difflab/hooks/<name>/HOOK.md` does not exist, treat it as a clean no-op and report that no `<name>` hook is registered. If invoked explicitly by the user and the file is missing, report the missing path and offer `hooks register <name>`.
3. Read `~/.difflab/hooks/<name>/HOOK.md` and inspect `## Trigger`, `## Action`, and `## Instructions`. Bind the caller-supplied context (such as merged PR URL, base branch, and base SHA for `on-merge`) into `Receives`.
4. Verify that the declared `Handler` (such as a `/difflab-flow` run or skill action) and `Requires` permissions are supported and authorized in the current session. Ask before executing any side-effecting action that lacks authorization in the current session.
5. Execute the hook's handler and instructions, then report the hook path, action run, and outcome.
