# difflab-cli

A Bun command-line application with a local Difflab MCP server.

## Run

```bash
bunx @difflab/difflab-cli
```

## Local Projects

A Project can contain multiple GitHub repositories. Its key is the sole project identifier and directory name: the CLI stores one SQLite database per Project under `~/.difflab/projects/<PROJECT_KEY>/...`; there is no separate slug or UUID. Migrations are bundled into the CLI and run locally, even in a standalone executable without network access.

Create a Project, repeating `--repo` for each repository:

```bash
difflab project add <PROJECT_KEY> --name 'My Project' --repo https://github.com/org/repo
```

Then link a repository to the existing Project:

```bash
cd /path/to/existing/github-repository
difflab init <PROJECT_KEY>
```

The `project add` command uses an Inquirer questionnaire for missing key, name, or repositories in a terminal. Agents and other non-interactive shells must provide these arguments explicitly. `difflab init <PROJECT_KEY>` only links the current repository to an existing Project; it never creates one. The existing `difflab-cli` command is an alias for `difflab`.

Initialization requires a GitHub HTTPS or SSH origin and never creates a Git repository. It writes a tracked `difflab.yaml` containing the Project key and canonical GitHub URL without staging it. The repo-root `.difflab` symlink points at the Project's per-repository artifact directory. Existing conflicting paths are never overwritten. Do not commit the symlink or SQLite files. A repository config copied to another machine needs explicit local setup; the read-only MCP tool will not import or repair it.

If initialization is interrupted, retry `difflab init <PROJECT_KEY>`; matching partial links and database rows can be reused, but conflicting paths require manual inspection. If the project registry reports a stale lock, inspect `~/.difflab/projects/.registry.lock/owner.json`, verify that its PID is no longer running, and only then remove that lock directory. Do not delete a Project database to repair a link.

The `project_context({ cwd })` MCP tool inspects initialized repositories without creating files or applying migrations. If it reports missing or inconsistent setup, load the portable `skills/difflab-init/SKILL.md` in your client's Agent Skills directory and follow its CLI steps. Existing `todo_*` MCP tools remain available.

## MCP setup

After installing the CLI so `difflab-cli` is on your PATH, register it with the MCP clients you use:

```bash
difflab-cli mcp setup --client pi
difflab-cli mcp setup --client cursor --client codex
```

Clients are selected explicitly. Supported names: `pi`, `cursor`, `codex`, `claude-code`, and `claude-desktop`. Pi uses the shared `~/.config/mcp/mcp.json` file (through the Pi MCP adapter), Cursor uses `~/.cursor/mcp.json`, Codex uses its CLI, Claude Code uses its CLI with user scope, and Claude Desktop uses its platform-specific user config. These clients do **not** all read one common file. Setup adds Difflab only when absent, leaves other servers in place, and refuses to replace a conflicting `difflab` entry. Codex and Claude Code must have their CLIs installed if selected. Restart or reload the selected client after setup.

MCP clients launch `npx -y @difflab/difflab-cli mcp serve` over stdio, so no daemon or port is needed. Bun must be on the client's PATH.

## Develop

```bash
mise run install
mise run test
mise run build
mise run run
bun src/index.ts mcp serve # stdio MCP server; a client starts this process
```

The package requires Bun 1.4.2 or later.
