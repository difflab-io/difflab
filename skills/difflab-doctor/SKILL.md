---
name: difflab-doctor
description: Diagnose Difflab CLI, templates, MCP tools, hooks, and repository setup. Apply scoped repairs on confirmation or doctor --fix.
compatibility: Requires a local terminal for CLI diagnostics and repairs. Exposed MCP tools are optional.
---

# Difflab doctor

Interpret `doctor`, `doctor --fix`, and `difflab setup` as skill requests. Run read-only diagnosis first and report the status, evidence, and next step for each area:

- Prerequisites and hooks: run `difflab --version` and `difflab setup` to inspect `git`, `bun`, `npx`, `gh` or `glab`, and `~/.difflab/hooks/{on-request-worktree,on-remote-delegation,on-merge}/HOOK.md`.
- Templates: inspect `Templates:` in `difflab setup` to make sure that `~/.difflab/templates` is unpacked and up to date with bundled templates.
- MCP: inspect exposed Difflab MCP tools and client MCP configuration, separating missing registration from clients that need a reload.
- Repository: inside a Git checkout, inspect `origin`, `difflab.yaml`, `.difflab`, `difflab project list`, and `project_context` when available.
- Capabilities: test required `gh` or `glab` authentication and delegation directly instead of assuming installed binaries work.

Ask before installing dependencies or changing files unless `--fix` was passed. Apply only scoped repairs: `npm install -g @difflab/difflab-cli` for a missing CLI, `difflab templates list` for missing templates, backing up and re-unpacking outdated templates after user confirmation, `difflab mcp setup --client <client>` for missing MCP registration, `difflab init <PROJECT_KEY>` for a missing repository link, and [difflab-hooks](../difflab-hooks/SKILL.md) (`hooks register`) for unset hooks. Use [difflab-init](../difflab-init/SKILL.md) to create new projects.

Never overwrite custom files without confirmation, delete shared stores, or commit or push changes. Rerun `difflab setup` after repairs and note when MCP changes need a client restart.
