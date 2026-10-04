---
name: difflab-init
description: Connect an existing GitHub repository to a local Difflab Project using the CLI. Use after project_context reports missing or inconsistent setup, or when asked to initialize a repository.
compatibility: Requires the Difflab CLI, Git, and a local terminal or agent shell. MCP project_context is optional for confirmation.
---

# Initialize a Difflab Project

A Project may contain several GitHub repositories. Do not infer the Project from a directory name, create one without the user's choice, or overwrite existing setup files.

1. Confirm that the current directory is inside the intended existing Git repository with a GitHub `origin`. If the CLI reports an unsupported origin or conflicting `difflab.yaml` or `.difflab` path, stop and show the error. Never remove or replace those paths automatically.
2. Run `difflab project list` and show the available Project IDs, names, and linked repositories. Ask the user which existing Project ID to use or what to name a new Project. Even if the list is empty, ask for the new name.
3. In an agent or other non-interactive shell, run `difflab init --project <chosen-id>` or `difflab init --new-project '<chosen-name>'` from the repository. Do not use plain `difflab init` in a non-TTY shell. In a human terminal, plain `difflab init` offers an interactive Project picker and **Create new project**.
4. If the CLI succeeds, call `project_context({"cwd":"/absolute/path/to/repository"})` when that MCP tool is available. Report the returned Project and GitHub repository. If it fails, report its error; do not claim setup succeeded or silently repair it.

The CLI writes a tracked `difflab.yaml` at the Git root, creates a local `.difflab` symlink and Git `info/exclude` entry, and keeps the Project database under `~/.difflab/projects/`. It does not stage files. If the CLI is unavailable or the agent has no shell, ask the user to install it and run the commands above in their terminal; then check `project_context` again. To install this skill, copy the `skills/difflab-init` directory into a client's supported Agent Skills directory. Do not rely on MCP elicitation for setup.
