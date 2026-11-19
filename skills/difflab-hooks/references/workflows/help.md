# Hooks help

- `hooks register <name>`: scaffold `~/.difflab/hooks/<name>/HOOK.md` from `hook-definition`, research live harness or tool documentation when needed, and record the trigger, handler (`default` or custom), required permissions, and instructions.
- `hooks invoke <name>`: read `~/.difflab/hooks/<name>/HOOK.md`, bind the caller context, and run the configured handler within authorized permissions.
- Preference hooks: `on-request-worktree` and `on-remote-delegation` store per-machine worktree, inter-worktree messaging, and `--remote` delegation preferences. When absent in an interactive run, the agent discovers relevant harness choices alongside `default`, asks once, and scaffolds `HOOK.md`.
- Lifecycle hooks: `/pr merge` inspects `~/.difflab/hooks/on-merge/HOOK.md` after merge and post-merge continuous integration finish and treats an absent file as a clean no-op.
