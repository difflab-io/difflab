# Difflab

Difflab helps an agent plan work, track progress, and review code. An agent is an AI assistant that follows your instructions. The command-line tool also serves MCP tools. MCP is the connection that lets an agent use Difflab tools.

## Before you start

Install Git, Node.js with `npx`, and Bun 1.4.2 or later. You need a Git repository with a GitHub origin (its remote address) for project setup. A pull request is a proposal to merge code on GitHub. For a remote pull request review, install `gh` and sign in with `gh auth login`.

## Install the command-line tool

```bash
npm install -g @difflab/difflab-cli
```

Confirm that the command works:

```bash
difflab --help
```

Connect the MCP server to Pi:

```bash
difflab mcp setup --client pi
```

Restart Pi after setup. For another supported client, replace `pi` with `cursor`, `codex`, `claude-code`, or `claude-desktop`. Setup changes the selected client's MCP configuration. It does not create a project or a plan.

## Install the agent skills

A skill is a set of instructions that tells an agent how to use Difflab. Install all eight skills for Pi with [`npx skills`](https://skills.sh/):

```bash
npx skills add difflab-io/difflab --agent pi --skill difflab-init difflab-todo difflab-plan difflab-review difflab-flow explore adr poc --global --yes
```

Restart Pi so it loads the skills. To choose skills and agents interactively, run `npx skills add difflab-io/difflab` without flags. If you test an unmerged checkout, run the command from that checkout and replace `difflab-io/difflab` with `.`. A GitHub install sees the skills on the repository's default branch. Planning init/new uses MCP `scaffold` when available and falls back to `difflab templates scaffold` when needed. Execution and review use MCP tools including `log_append`; if these are missing, update the CLI and register the selected client, then restart or reload it.

## Set up a repository

Create a Difflab project for a GitHub repository. Use a project key of 3 to 16 uppercase letters or digits that starts with a letter:

```bash
difflab project add MYAPP --name "My App" --repo https://github.com/my-org/my-app.git
cd /path/to/my-app
difflab init MYAPP
```

`difflab init` writes `difflab.yaml` and creates a local `.difflab` link to the project store. You can track `difflab.yaml` in Git. Do not commit the `.difflab` link or files in the project store. If the project already exists, run only `difflab init MYAPP` in the repository.

## Use the skills

Ask your agent in chat. These phrases are skill requests, not `difflab` shell commands:

- “Plan init for an export feature.” The agent creates `INTENT.md` for you to fill in.
- “Plan a new export feature that writes CSV files.” The agent creates and fills `PLAN.md`.
- “Update the export plan to include retries.” The agent saves the prior plan under `revisions/`.
- “Plan go for export” or “Plan go for export --bg.” The agent executes the plan and records progress.
- “Review new --local.” The agent writes local change requests in `REVIEW.md`.
- “Review new.” The agent runs checks, commits and pushes changes, opens or reuses a draft pull request, and publishes verified inline findings.
- “Review address.” The agent fixes requested changes, pushes the fix, and replies in each thread. It resolves only small, fully completed requests. It leaves questions, broad refactors, and reopened threads open.
- “Flow new autospec for CSV export with an optional remote review.” The agent creates a reusable definition, not a run.
- “Flow go autospec with input 'Export monthly sales' --local.” The agent freezes a local run before executing it.
- “Explore new options for caching.” The agent saves research with external sources under `.difflab/explore/`.
- “Explore update caching with new evidence.” The agent saves the old research before it updates the findings.
- “ADR init for cache storage.” The agent creates `adr/NNNN-title/ADR.md`, with room for diagrams beside it.
- “ADR new for cache storage.” The agent fills the record. “ADR update 0001” revises one.
- “PoC init cache-test” or “PoC new compare cache stores.” The agent uses an isolated `poc/*` branch and records its base commit in the branch README.
- “PoC freeze.” The agent tags the experiment and asks before it deletes the local and remote branches.

`--bg` runs a workflow in a background agent. For remote review, it authorizes commits, pushes, draft pull requests, verified inline comments, and eligible thread resolutions without another permission prompt. If a target or permission is unclear, the worker stops and reports the problem. `--local` makes no remote changes and does not commit.

Plans, reviews, and explorations live under `.difflab/plans/`, `.difflab/reviews/`, and `.difflab/explore/`. They are local project-store files. ADRs live in numbered directories under the tracked `adr/` directory. PoC branches replace the root README with the experiment README and provide mise tasks for build, tests, and each prototype. The skills require focused modules, simple code, and minimal examples; no forge merge gate is needed.

A flow definition lives at `~/.difflab/flows/<name>.md` and works from different initialized repositories. Edit it by hand before a new run. A run keeps its own frozen copy at `.difflab/flows/YYMMDD-<name>/FLOW.md` and progress at the sibling physical `logs.txt`. If that path exists, the agent asks you to resume that exact unfinished run or choose another run ID. It never overwrites the file. The agent records results between steps and resumes at the first unchecked step. `--local` removes remote steps before the run starts. `--commit` permits only a declared local commit step when you pass it; it does not allow a push, review publication, or merge. Remote review needs separate permission and must pass the review skill's checks. No flow skill adds a `difflab flow` CLI command. See [the command-line guide](apps/difflab-cli/README.md) for template and MCP tool details, or browse the [skill instructions](skills/).

### PoC merge policy

PoC branches are experiments: freeze them as tags instead of merging them. The PoC workflow directs experiments to freeze; review-only PRs are allowed, and the PR skill has no PoC-specific interventions. Users remain responsible for merge decisions. No PoC-specific GitHub permissions, branch protections, or blocking Actions are required.

When upgrading from the former merge gate, remove only the required status check `Block PoC source branch` from any production-branch protection or active ruleset before removing its workflow. Keep unrelated required checks and protections.

After upgrading, reinstall the changed skills through the same skill installation command and reload your client. Existing user-wide templates are preserved as user-owned copies; compare `~/.difflab/templates/poc-readme.md` with the updated packaged template and apply its setup/tasks and code-map sections explicitly. The PoC skill requires these sections even when scaffolding an older template.
