# Difflab hooks help

Examples:

- "Register an `on-merge` hook to run `flow go autoreview`" -> scaffold `~/.difflab/hooks/on-merge/HOOK.md`.
- "Hooks register `on-request-worktree`" -> discover active harness and multiplexer choices alongside `default`, confirm, and scaffold `HOOK.md`.
- "Hooks invoke `on-merge`" -> read `~/.difflab/hooks/on-merge/HOOK.md` and execute its handler within authorized permissions.

Safety rules: reject symlinks and unsafe hook names, never overwrite an existing `HOOK.md`, treat absent event hooks as no-ops during skill runs, and prompt interactively (or block in background runs) when a required worktree or remote preference hook is unset.

Dry-run request: show `~/.difflab/hooks/<name>/HOOK.md` and the intended `scaffold` or handler call without writing files or running commands.
