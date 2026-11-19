---
name: difflab-hooks
description: Register and invoke reusable global Difflab hooks stored at ~/.difflab/hooks/{name}/HOOK.md. Triggers on hooks register, hooks invoke, hooks help, register a hook, and invoke a hook.
compatibility: Requires Difflab MCP scaffold (or CLI equivalent) for register and first-time preference hook setup.
---

# Difflab hooks

This skill defines agent behavior, not a `difflab hooks` CLI command. Interpret natural-language requests. Hook definitions live at `~/.difflab/hooks/<name>/HOOK.md` and fall into two categories:

- Lifecycle event hooks (such as `on-merge` after `/pr merge`), which are optional no-ops when absent.
- Machine preference hooks (`on-request-worktree` and `on-remote-delegation`), which define how this machine creates isolated worktrees (separate Git checkouts), coordinates inter-worktree workers, and delegates `--remote` work. Setting `Handler: default` inside `HOOK.md` records an explicit choice to use built-in behavior without prompting again.

## Workflows

- `register`: follow [register](references/workflows/register.md).
- `invoke`: follow [invoke](references/workflows/invoke.md).
- `help` or unclear request: follow [help](references/workflows/help.md).

Read the selected workflow before acting. Keep vendor-specific syntax out of generic prompts: inspect the active harness, environment variables, loaded skills, local `--help` output, and current official documentation before proposing or writing custom hook instructions. Treat hook definitions as user-owned instructions within the authorized scope of the current session and the safety rules of the called skill.

If tools or setup fail, invoke [difflab doctor](../difflab-doctor/SKILL.md) to diagnose the problem and `difflab doctor --fix` to repair it.
