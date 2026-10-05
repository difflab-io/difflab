# difflab-cli

A Bun command-line application with a local Difflab MCP server.

## Run

```bash
bunx @difflab/difflab-cli
```

## Local Projects

A Project can contain multiple GitHub repositories. Its key is the sole project identifier and directory name; there is no separate slug or UUID. All Projects and repositories share one user-wide SQLite database at `~/.difflab/difflab.sqlite`. The CLI keeps repository artifacts separately under `~/.difflab/projects/<PROJECT_KEY>/<github-owner>--<github-repo>/`. The database migrations run locally on write operations.

Create a Project, repeating `--repo` for each repository:

```bash
difflab project add <PROJECT_KEY> --name 'My Project' --repo https://github.com/org/repo
```

Then link a repository to the existing Project:

```bash
cd /path/to/existing/github-repository
difflab init <PROJECT_KEY>
```

The `project add` command requires a project key, name, and at least one repository. If any value is missing, it returns command guidance instead of prompting. `difflab init <PROJECT_KEY>` only links the current repository to an existing Project; it never creates one. The existing `difflab-cli` command is an alias for `difflab`.

Initialization requires a GitHub HTTPS or SSH origin and never creates a Git repository. It writes a tracked `difflab.yaml` containing only the Project key without staging it. The repo-root `.difflab` symlink points at the Project's per-repository artifact directory. Existing conflicting paths are never overwritten. Do not commit the symlink or SQLite files. A repository config copied to another machine needs explicit local setup; the read-only MCP tool will not import or repair it.

If initialization is interrupted, retry `difflab init <PROJECT_KEY>`; matching partial links and database rows can be reused, but conflicting paths require manual inspection. Do not delete the shared database to repair a repository link.

The `project_context({ cwd })` MCP tool inspects initialized repositories without creating files or applying migrations. If it reports missing or inconsistent setup, load the portable `skills/difflab-init/SKILL.md` in your client's Agent Skills directory and follow its CLI steps. Existing `todo_*` MCP tools remain available.

## MCP setup

After installing the CLI so `difflab-cli` is on your PATH, register it with the MCP clients you use:

```bash
difflab-cli mcp setup --client pi
difflab-cli mcp setup --client cursor --client codex
```

Clients are selected explicitly. Supported names: `pi`, `cursor`, `codex`, `claude-code`, and `claude-desktop`. Pi uses the shared `~/.config/mcp/mcp.json` file (through the Pi MCP adapter), Cursor uses `~/.cursor/mcp.json`, Codex uses its CLI, Claude Code uses its CLI with user scope, and Claude Desktop uses its platform-specific user config. These clients do **not** all read one common file. Setup adds Difflab only when absent, leaves other servers in place, and refuses to replace a conflicting `difflab` entry. Codex and Claude Code must have their CLIs installed if selected. Restart or reload the selected client after setup.

MCP clients launch `npx -y @difflab/difflab-cli mcp serve` over stdio, so no daemon or port is needed. Bun must be on the client's PATH.

## Document templates

List the available templates or scaffold a new document from one:

```bash
difflab-cli templates list
difflab-cli templates scaffold spec-driven-plan docs/plans first-plan.md --cwd /absolute/project/path
```

The CLI defaults `--cwd` to its current directory. The MCP server exposes `template_list({})` and `scaffold({"name":"spec-driven-plan","cwd":"/absolute/project/path","path":"docs/plans","filename":"first-plan.md"})`. Both interfaces take a hyphenated template name, a relative destination **directory** (`path`, or `.` for `cwd`), and a separate **filename**. MCP always requires an absolute existing `cwd`. Missing destination directories are created. Available names: `spec-driven-plan`, `software-architecture-design`, `architecture-decision-record`, `product-requirements-document`, `code-review`, `planning-intent`, `ui-component-architecture`, and `pull-request-description` (adapted from Diffpi's PR template).

On first use, missing bundled templates and filled examples are copied to `~/.difflab/templates` and `~/.difflab/templates/examples`. Edit the installed templates to customize future documents. Later runs add missing files but never replace existing ones, even after an upgrade. Examples are for reference, not selectable templates. Copying is literal: prompts and placeholders are not substituted. An unknown name, missing or invalid source, unsafe path, symlink, or existing destination causes an error; destination files are never overwritten. The target directory must remain inside `cwd` and the filename must be a single file name without separators. To restore a bundled default, move your installed copy aside before listing again.

## Develop

```bash
mise run install
mise run test
mise run build
mise run run
bun src/index.ts mcp serve # stdio MCP server; a client starts this process
```

The package requires Bun 1.4.2 or later.
