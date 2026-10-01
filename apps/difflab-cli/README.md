# difflab-cli

A Bun command-line application with a local Difflab MCP server.

## Run

```bash
bunx @difflab/difflab-cli Premise
```

## MCP todo tools

After installing the CLI so `difflab-cli` is on your PATH, register it with the MCP clients you use:

```bash
difflab-cli mcp setup --client pi
difflab-cli mcp setup --client cursor --client codex
```

Clients are selected explicitly. Supported names: `pi`, `cursor`, `codex`, `claude-code`, and `claude-desktop`. Pi uses the shared `~/.config/mcp/mcp.json` file (through the Pi MCP adapter), Cursor uses `~/.cursor/mcp.json`, Codex uses its CLI, Claude Code uses its CLI with user scope, and Claude Desktop uses its platform-specific user config. These clients do **not** all read one common file. Setup adds Difflab only when absent, leaves other servers in place, and refuses to replace a conflicting `difflab` entry. Codex and Claude Code must have their CLIs installed if selected. Restart or reload the selected client after setup.

`mcp setup` does **not** create a todo file. Use the `todo_init` MCP tool to create a list. MCP clients launch `npx -y @difflab/difflab-cli mcp serve` over stdio, so no daemon or port is needed. Bun must be on the client's PATH.

Each todo call requires **`cwd` (an absolute path to an existing directory)** and **`path` (a relative path to a JSON todo file inside that directory)**. They are supplied per call, not in the MCP server configuration. For example, with `cwd` set to `/home/alex`:

```text
todo_init({"cwd":"/home/alex","path":"todos.json"})
todo_add({"cwd":"/home/alex","path":"todos.json","text":"Review PR"})
```

`todo_list`, `todo_complete`, and `todo_remove` also require both fields; the latter two require a task `id` returned by `todo_list` or `todo_add`. Call `todo_init` before other operations on a new file. Parent traversal outside `cwd`, absolute `path` values, and symlinked paths are rejected. Keep personal todo files outside the repository or add their paths to `.gitignore`. Concurrent writes to the same file are not yet coordinated.

Agents in this repo can load `skills/difflab-todo/SKILL.md` for usage instructions.

## Develop

```bash
mise run install
mise run test
mise run build
mise run run
bun src/index.ts mcp serve # stdio MCP server; a client starts this process
```

The package requires Bun 1.4.2 or later.
