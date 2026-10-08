# Setup and recovery

## CLI availability

Check `difflab --help` before relying on CLI commands. If absent, offer `npm install -g @difflab/difflab-cli` and obtain installation authorization if not already supplied. Use the existing installation when available. If installation or a shell is unavailable, give the user the concrete command and report the limit.

## Repository project link

Inspect the actual GitHub origin, `difflab.yaml`, and `.difflab`. Keep an existing valid project-store symlink. Never replace a conflicting file, broken link, or inconsistent project configuration automatically; report the conflict for inspection.

Run `difflab project list` and match the repository origin and any configured project key against existing membership. A unique match may be linked with `difflab init <PROJECT_KEY>` when current authorization covers setup. Otherwise show that concrete command and ask for project choice or setup approval. Do not infer a project from a directory name.

If no existing project matches, ask for the project key/name and approval before creating one:

```sh
difflab project add <PROJECT_KEY> --name 'My Project' --repo https://github.com/org/repo
```

Repeat `--repo` for additional repositories when requested. Supply all required values; the CLI gives guidance rather than prompting. Then run `difflab init <PROJECT_KEY>` from the repository. Init only links to an existing Project and never creates one. Unsupported origins or conflicting paths are failures, not permission to replace setup.

Verify the resulting configuration and symlink. If available, call `project_context({cwd:<absolute-root>})` to confirm. Report any error rather than treating a failed check as success. The CLI writes a tracked project-key-only `difflab.yaml` without staging it, creates `.difflab` pointing to the user-wide project's repository artifact directory, and uses `~/.difflab/difflab.sqlite` as the shared database. Never create a substitute store.

## Client MCP registration

Use exposed Difflab MCP tools when available; preserve their current behavior on Pi, Claude, Cursor, and Codex. If tools are absent, explain that they are unavailable in this session and inspect whether registration is missing or already present.

Offer `difflab mcp setup --client <client>` using the known session client; ask if unclear. Supported names are `pi`, `cursor`, `codex`, `claude-code`, and `claude-desktop`. For Codex use `difflab mcp setup --client codex`. Obtain configuration-change authorization if not already provided. Codex and Claude Code registration also need the respective client CLI.

The setup command preserves unrelated servers and refuses conflicting Difflab entries. Report failures and automatic approval rejections honestly; do not replace configuration manually to bypass them. On success, tell the user to restart or reload the selected client. Registration does not prove tools have loaded in the active session. If already registered, avoid repeating setup and report the need for reload or diagnosis.

Return the verified store path and capabilities to the calling skill. That skill may continue authorized work through a documented CLI equivalent while MCP remains unavailable. Never pretend an unavailable tool succeeded. Background delegation and `log_append` are separate capabilities: do not replace background agents with scheduling claims or MCP progress logs with direct file writes. A dry run never installs, registers, or initializes anything.
