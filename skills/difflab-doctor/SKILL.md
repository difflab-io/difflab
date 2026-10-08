---
name: difflab-doctor
description: Diagnose Difflab CLI, MCP tools, and repository setup; apply scoped repairs when the user requests doctor --fix.
compatibility: Requires a local terminal for CLI diagnostics and repairs; exposed MCP tools are optional.
---

# Difflab doctor

Interpret `doctor` and `doctor --fix` as skill requests, not new CLI commands. Default to diagnosis only. Report the status, evidence, and next step for each relevant check:

- CLI: check `difflab --version` and command availability.
- MCP: check which Difflab tools the active session exposes. If missing, inspect the known client's registration; ask which client only when unclear. Distinguish absent configuration from registered tools that need reload or diagnosis.
- Repository: when inside a Git repository, inspect its origin, `difflab.yaml`, `.difflab` link, and matching membership from `difflab project list`. Use `project_context` when available. Outside a repository, mark these checks inapplicable.
- Workflow prerequisites: check requested capabilities such as `gh`/`glab` authentication or native background delegation when relevant. Do not infer successful access from installed binaries alone.

With `--fix`, apply only repairs needed by the diagnosis, using existing commands: `npm install -g @difflab/difflab-cli` for a missing CLI, `difflab mcp setup --client <client>` for missing registration, or `difflab init <PROJECT_KEY>` for a missing repository link with uniquely verified project membership. Use existing authorization; ask for unresolved client/project choices. Project creation belongs to [difflab-init](../difflab-init/SKILL.md).

Preserve working integrations and unrelated settings. Never overwrite conflicting configuration, delete shared stores, or bypass a denied action. Report failures with the concrete next step. Recheck after repairs; successful registration still requires client restart/reload and does not prove tools are available in this session. Report remaining limitations and return to the calling skill. A dry run shows intended commands without applying repairs. Do not commit, push, or start implementation as part of doctor.
