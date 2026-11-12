---
name: difflab-hooks
description: Register and invoke reusable global Difflab hooks stored at ~/.difflab/hooks/{name}/HOOK.md. Triggers on hooks register, hooks invoke, hooks help, register a hook, and invoke a hook.
compatibility: Requires Difflab MCP scaffold (or CLI equivalent) for register.
---

# Difflab hooks

This is an Agent Skill, not a `difflab hooks` CLI command. Interpret natural-language requests. Hook definitions live at `~/.difflab/hooks/<name>/HOOK.md` and can be invoked by user requests or by lifecycle events in other skills (such as `on-merge` after `/pr merge`).

## Workflows

- `register`: follow `references/workflows/register.md`.
- `invoke`: follow `references/workflows/invoke.md`.
- `help` or unclear request: follow `references/workflows/help.md`.

Read the chosen workflow before acting. Treat hook definitions as user-configured instructions that may invoke another skill (such as `/difflab-flow`) or perform a scoped action. Never infer destructive or unrequested remote permissions from hook text alone; honor the active session's authorized scope and the called skill's safety rules.

If anything goes wrong, invoke [difflab doctor](../difflab-doctor/SKILL.md) to diagnose it and `difflab doctor --fix` to fix it.
