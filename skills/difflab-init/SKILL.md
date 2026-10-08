---
name: difflab-init
description: Connect an existing GitHub repository to a local Difflab Project using the CLI. Use after project_context reports missing or inconsistent setup, or when asked to initialize a repository.
compatibility: Requires the Difflab CLI, Git, and a local terminal or agent shell. MCP project_context is optional for confirmation.
---

# Initialize a Difflab Project

If prerequisites or existing setup fail, invoke [Difflab doctor](../difflab-doctor/SKILL.md) to diagnose them; use `doctor --fix` only when repair is requested or already authorized. Return here for project creation and repository initialization.

A Project may contain several GitHub repositories. Its key is the sole project identifier and directory name under `~/.difflab/projects/<PROJECT_KEY>/...`; there is no separate slug or UUID. Do not infer the Project from a directory name, create one without the user's choice, or overwrite existing setup files.

1. To create a Project, run `difflab project add <PROJECT_KEY> --name 'My Project' --repo https://github.com/org/repo`. Repeat `--repo` for additional repositories. The command returns guidance when the key, name, or repositories are missing; provide all arguments explicitly.
2. Confirm that the current directory is inside the intended existing Git repository with a GitHub `origin`. If the CLI reports an unsupported origin or conflicting `difflab.yaml` or `.difflab` path, stop and show the error. Never remove or replace those paths automatically.
3. Link the repository to an existing Project with `difflab init <PROJECT_KEY>`. Init only links to an existing Project and never creates one.
4. If the CLI succeeds, call `project_context({"cwd":"/absolute/path/to/repository"})` when that MCP tool is available. Report the returned Project and GitHub repository. If it fails, report its error; do not claim setup succeeded or silently repair it.

The CLI writes a tracked project-key-only `difflab.yaml` at the Git root, creates a local `.difflab` symlink to `~/.difflab/projects/<PROJECT_KEY>/<github-owner>--<github-repo>`, and keeps the single user-wide Project database at `~/.difflab/difflab.sqlite`. It does not stage files. If the CLI is unavailable or the agent has no shell, ask the user to install it and run the commands above in their terminal; then check `project_context` again. To install this skill, copy the `skills/difflab-init` directory into a client's supported Agent Skills directory. Do not rely on MCP elicitation for setup.
