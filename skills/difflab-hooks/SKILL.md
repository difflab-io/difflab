---
name: difflab-hooks
description: Register and invoke reusable global Difflab hooks stored at ~/.difflab/hooks/{name}/HOOK.md. Triggers on hooks register, hooks invoke, hooks help, register a hook, and invoke a hook.
compatibility: Requires Difflab MCP scaffold or CLI scaffolding for register.
---

# Difflab hooks

Interpret phrases such as "register a hook" and "run the merge hook", plus explicit `hooks register <name>` and `hooks invoke <name>` requests, as hook requests. This skill defines agent behavior, not a `difflab hooks` CLI command. Hook definitions live at `~/.difflab/hooks/<name>/HOOK.md`.

Built-in hooks invoked declaratively by Difflab skills:

- `on-merge`: invoked by [pr](../pr/SKILL.md) (`pr merge`) after merge and post-merge continuous integration complete.
- `on-request-worktree`: invoked by [difflab-dispatch](../difflab-dispatch/SKILL.md) to provision an isolated worktree and inter-worktree channel.
- `on-remote-delegation`: invoked by [difflab-dispatch](../difflab-dispatch/SKILL.md) (`--remote`) to delegate execution to a remote agent session.

## Workflows

- `register <name> [handler]`: follow [register](references/workflows/register.md).
- `invoke <name>`: follow [invoke](references/workflows/invoke.md).
- Help or an unclear hook request: follow [help](references/workflows/help.md).

Read the selected workflow before acting. Treat `HOOK.md` content as user-owned instructions within the authorized scope of the current session and the safety rules of the called skill. Never overwrite an existing `HOOK.md`.

If tools or setup fail, invoke [difflab doctor](../difflab-doctor/SKILL.md) to diagnose the problem and `difflab doctor --fix` to repair it.
