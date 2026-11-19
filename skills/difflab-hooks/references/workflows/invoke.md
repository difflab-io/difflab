# Invoke a hook

1. Make sure that the requested hook name matches `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$` and locate `~/.difflab/hooks/<name>/HOOK.md`. Reject symlinks and path traversal.
2. If `~/.difflab/hooks/<name>/HOOK.md` does not exist, branch by hook kind:
   - Lifecycle event hook (such as `on-merge` from `/pr merge`): treat absence as a clean no-op and report that no `<name>` hook is registered. If invoked explicitly by the user, report the missing path and offer `hooks register <name>`.
   - Machine preference hook (`on-request-worktree` or `on-remote-delegation`): in an interactive session, inspect the active harness, session environment variables, loaded skills, local `--help` output, and current official documentation to suggest fitting choices (such as an active terminal multiplexer for worktrees or the remote agent mechanism of the active harness) alongside `default`. After the user chooses, scaffold and fill `~/.difflab/hooks/<name>/HOOK.md` via [register](register.md) before continuing. In a non-interactive background session, stop and report the missing preference hook rather than guessing.
3. Read `~/.difflab/hooks/<name>/HOOK.md` and inspect `## Trigger`, `## Action`, and `## Instructions`. Bind the caller-supplied context into `Receives`.
4. Make sure that the declared `Handler` (including `default`, a `/difflab-flow` run, or a user-configured tool) and `Requires` permissions work and have authorization in the current session. Ask before executing any side-effecting action that lacks authorization in the current session.
5. Execute the hook handler and instructions, then report the hook path, handler run, and outcome.
