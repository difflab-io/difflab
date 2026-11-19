---
name: difflab-doctor
description: Diagnose Difflab CLI, machine setup, MCP tools, hooks, and repository setup, and apply scoped repairs on confirmation or doctor --fix.
compatibility: Requires a local terminal for CLI diagnostics and repairs. Exposed MCP tools are optional.
---

# Difflab doctor

Interpret `doctor`, `doctor --fix`, and `difflab setup` requests as skill requests. Default to read-only diagnosis first and report the status, evidence, and next step for each area:

- Machine setup: run `difflab setup` and `difflab --version` to inspect global `PATH` prerequisites (`git`, `bun`, `npx`, and `gh` or `glab`), unpacked `~/.difflab/templates`, and global hooks (`on-request-worktree`, `on-remote-delegation`, and optional `on-merge`).
- MCP: inspect which Difflab tools the active session exposes. If tools are missing, inspect the client configuration and ask which client only when unclear. Distinguish absent configuration from registered tools that need client reload.
- Repository: when inside a Git repository, inspect its `origin`, `difflab.yaml`, `.difflab` link, and matching membership from `difflab project list` (and `project_context` when available). Outside a repository, mark repository inspection inapplicable.
- Workflow capabilities: make sure that requested capabilities such as `gh` or `glab` authentication or native delegation actually work rather than inferring access from installed binaries alone.

When `difflab setup` or diagnosis reports missing prerequisites, unpacked templates, or unset preference hooks (`on-request-worktree` and `on-remote-delegation`), ask the user whether you must install or configure the missing items for them before mutating anything. With `--fix` or user confirmation, apply only scoped repairs: `npm install -g @difflab/difflab-cli` for a missing CLI, `difflab templates list` for missing templates, `difflab mcp setup --client <client>` for missing MCP configuration, `difflab init <PROJECT_KEY>` for a missing repository link with verified project membership, and [difflab-hooks](../difflab-hooks/SKILL.md) (`hooks register`) using live harness and documentation discovery for unset hooks. Project creation belongs to [difflab-init](../difflab-init/SKILL.md).

Preserve working integrations and existing `HOOK.md` files. Never overwrite conflicting configuration, delete shared stores, or bypass a denied action. Rerun diagnosis after repairs, note when MCP registration requires a client restart or reload, and report remaining limits. Do not commit, push, or start implementation during doctor.
