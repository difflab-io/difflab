---
name: difflab-setup
description: Set up the Difflab CLI, client MCP registration, and repository project link, or recover missing tools and setup.
compatibility: Requires Git and a local terminal; Difflab CLI performs registration and repository initialization. MCP project_context is optional for confirmation.
---

# Difflab setup

Use this skill when Difflab tools or repository setup are missing, or the user asks to configure Difflab. Confirm the absolute checkout root for repository operations. Existing working MCP integrations need no reconfiguration. Read [setup and recovery](references/recovery.md) for the requested setup step, then return to the calling workflow.

A Project may contain several GitHub repositories. Its key is the sole project identifier and directory name under `~/.difflab/projects/<PROJECT_KEY>/...`; do not infer it from a directory name or create a project without the user's choice.

Setup authorization does not authorize plan creation, implementation, commits, or pushes. Respect existing authorization; ask only for missing project/client choices or configuration changes not already authorized. A dry run shows proposed paths and commands without changing files. Never overwrite conflicting setup, delete the shared database, or claim unavailable tools are loaded.
