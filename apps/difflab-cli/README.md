# difflab-cli

A Bun command-line application with a local Difflab MCP server.

## Run

```bash
bunx @difflab/difflab-cli
```

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
