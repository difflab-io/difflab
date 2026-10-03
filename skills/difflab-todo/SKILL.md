---
name: difflab-todo
description: Manage a JSON todo list using Difflab MCP. Use when asked to create a todo list, add or list tasks, mark a task done, or remove a task.
compatibility: Requires the installed @difflab/difflab-cli command, Bun 1.4.2 or later, and a client that supports MCP tools.
---

# Difflab todo

The Difflab MCP server provides todo tools alongside other Difflab capabilities. Every todo tool call requires the same two location fields:

- `cwd`: An **absolute path to an existing directory**, such as the repository root. Do not assume the MCP server's process directory is the user's workspace.
- `path`: A **relative JSON filename inside `cwd`**, such as `todos.json` or `notes/todos.json`. Do not pass an absolute path, traverse outside `cwd` with `..`, or use symlinks. Paths within `cwd` can contain new subdirectories; `todo_init` creates them.

Use the user's chosen file. If the location is unknown, ask for it. A single server can manage several lists; pass `cwd` and `path` on **every** call. For example: `todo_init({"cwd":"/absolute/project","path":"todos.json"})` followed by `todo_add({"cwd":"/absolute/project","path":"todos.json","text":"Review PR"})`.

If the `difflab` MCP server is not configured, use the installed CLI to register it with the user's selected client: `difflab-cli mcp setup --client <name>`. Supported client names are `pi`, `cursor`, `codex`, `claude-code`, and `claude-desktop`; repeat `--client` to select multiple clients. Ask which client to configure if unclear. This adds Difflab to each selected client's user-level MCP configuration, leaves other servers unchanged, and does not create or modify a todo file. Pi reads `~/.config/mcp/mcp.json` through its MCP adapter; the other clients have their own configuration. The registered stdio command is `npx -y @difflab/difflab-cli mcp serve`, so npm/npx and Bun must be on the client's PATH. If a client reports a conflicting `difflab` entry, do not overwrite it. Codex and Claude Code need their respective CLIs installed for setup. If `difflab-cli` is unavailable, tell the user to install it first. Ask the user to restart or reload the client after setup; do not claim a tool call succeeded until the client exposes the tools. Create new lists with `todo_init`, not with CLI setup.

When the tools are available:

- Use `todo_init` with `cwd` and `path` if the file does not yet exist. It never resets existing tasks.
- Use `todo_list` with `cwd` and `path` to retrieve IDs and task status.
- Use `todo_add` with `cwd`, `path`, and non-empty `text` to add a task.
- Use `todo_complete` with `cwd`, `path`, and a task `id` to mark it done.
- Use `todo_remove` with `cwd`, `path`, and a task `id` to permanently delete it. Confirm the user's intent if unclear.

Use IDs returned by the tools, not task positions. If a call reports a missing file, use `todo_init` only when the user wants a new list; do not silently create a different list. If it reports invalid JSON, report the error rather than overwriting the user's data. Do not edit the JSON directly while the MCP server is in use. Concurrent writes to the same path are not yet coordinated.
