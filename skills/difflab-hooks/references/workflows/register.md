# Register a hook

1. Require a safe hook name matching `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$` (such as `on-merge`) and a clear trigger and action from the user. Ask if the name, trigger, or intended action is missing.
2. Confirm `~/.difflab` is the user's physical home store (not a symlink) and that `~/.difflab/hooks/<name>/HOOK.md` does not already exist. If it exists, stop and offer deliberate editing or another name; never overwrite an existing hook.
3. Call MCP `scaffold({name:"hook-definition",cwd:"<absolute home>/.difflab",path:"hooks/<name>",filename:"HOOK.md"})` (or `difflab templates scaffold hook-definition hooks/<name> HOOK.md --cwd <absolute home>/.difflab`). Do not pass `path:".difflab/hooks/<name>"` with `cwd=<home>`, which targets a repository store.
4. Read the scaffolded `HOOK.md` and fill `## Trigger`, `## Action` (`Handler`, `Requires`, `Receives`), and `## Instructions` concisely using [difflab-writing-style](../../../difflab-writing-style/SKILL.md). A hook may launch a `/difflab-flow` (for example `flow go <name>`) or another skill workflow.
5. Report the created `~/.difflab/hooks/<name>/HOOK.md` path, trigger, and handler. Do not execute the hook during `register`.
