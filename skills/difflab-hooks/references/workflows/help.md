# Hooks help

- `hooks register <name>`: scaffold `~/.difflab/hooks/<name>/HOOK.md` from the `hook-definition` template and record the trigger, skill/flow handler, required permissions, and instructions.
- `hooks invoke <name>`: read `~/.difflab/hooks/<name>/HOOK.md`, bind the event or caller context, and run the configured handler (such as a `/difflab-flow` workflow) within authorized permissions.
- Lifecycle hooks: `/pr merge` checks for `~/.difflab/hooks/on-merge/HOOK.md` after a merge completes and invokes `on-merge` with the merge context when present.
