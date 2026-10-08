# Planning setup and tool recovery

Use this when a planning workflow needs initialization or scaffolding. A dry run only describes the paths and proposed setup/scaffold calls; do not register clients, initialize a repository, or create files.

## Repository store

Confirm the absolute Git root and inspect `difflab.yaml` and `.difflab`. Keep an existing valid project-store symlink. Never replace a conflicting file, broken link, or inconsistent project configuration automatically.

If the link is missing, follow the [Difflab init skill](../../difflab-init/SKILL.md). Read `difflab project list` and match the repository's actual origin and configured project key against existing membership. A unique match may be linked with `difflab init <project-key>` when current authorization covers setup. Otherwise show the concrete proposed command and ask for setup approval or project choice. Do not infer a project from the directory name. If none matches, ask for the project key/name and approval before `difflab project add`; do not create a project silently. Verify the resulting link and configuration. If available, use `project_context` to confirm; report any error rather than treating a failed check as success.

## Scaffolding capability

Use the exposed MCP `scaffold` tool when available. Keep its existing arguments and behavior on Pi, Claude, Cursor, and Codex; do not reconfigure an integration whose tools already work.

When the tool is absent, explain that it is unavailable in this session. Offer registration using `difflab mcp setup --client <client>` with the supported client name (`pi`, `cursor`, `codex`, `claude-code`, or `claude-desktop`). Use the known session client; ask if the client is unclear. For Codex the command is `difflab mcp setup --client codex`. Obtain authorization to change client configuration if it is not already provided. The CLI instructs the user to restart or reload that client. Successful registration does not prove tools have loaded in the active session. If already registered, avoid repeating setup and report that the client needs reload or diagnosis.

If MCP remains unavailable and the CLI is available, continue authorized planning with the existing CLI equivalent:

```sh
difflab templates scaffold <template-name> <relative-directory> <filename> --cwd <absolute-repository-root>
```

For example, `plan new` uses template `spec-driven-plan`, directory `.difflab/plans/YYMMDD-<slug>`, and filename `PLAN.md`; `plan init` uses `planning-intent` and `INTENT.md`. Confirm the command through CLI help if needed; never invent flags. Both interfaces refuse overwrites. Read the created template and fill only the selected workflow's document. Choose the interface by tool availability, not client identity.

If neither interface is available, report the missing capabilities and offer CLI installation or MCP setup with a concrete next step. Do not substitute a hand-rendered template or create a store unless the user explicitly authorizes a manual fallback. An automatic approval rejection is a failed action, not permission: report its reason and continue only independent authorized work.

This fallback covers scaffolding only. Updates snapshot existing files locally and do not need scaffold. Execution still requires `log_append` for progress: keep its absolute physical path and never replace it with direct log writes. Missing background delegation affects background execution, not init/new/update.
