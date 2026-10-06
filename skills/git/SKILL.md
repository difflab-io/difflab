---
name: git
description: Git workflows for conventional commits, intent-preserving rebases, coherent squash, branch sync, worktrees, local excludes, and help. Triggers on “git commit”, “git rebase”, “git squash”, “git sync”, and “git help”.
---

# Git workflows

This is a natural-language Agent Skill, not a CLI parser or a new Git interface. Infer the requested action from the user's message; read the corresponding reference before acting. If no action is clear, use [help](references/workflows/help.md) and ask for clarification when necessary. Treat options below as user intent, not as instructions to implement new commands. Preserve the user's existing changes. No remote write is implied by a local Git request.

- Commit, create a conventional commit, or commit my changes: [commit](references/workflows/commit.md). Local-only unless the user requests `--push` or explicitly asks to push.
- Rebase or update my branch onto a base: [rebase](references/workflows/rebase.md). No push by default; `--push` authorizes a guarded update of the feature branch.
- Squash or clean up branch history: [squash](references/workflows/squash.md). Local-only by default; `--push` authorizes a guarded update of the rewritten feature branch.
- Sync or bring current branch and main up to date: [sync](references/workflows/sync.md). Fetch and reconcile local refs only, without pushing.
- Add, list, or remove local exclude patterns: [exclude](references/workflows/exclude.md). Do not edit tracked ignore rules.
- Help or unrecognized request: [help](references/workflows/help.md). Do not invent a verb or silently perform a different action.

Use the local [GitHub](references/providers/github.md) or [GitLab](references/providers/gitlab.md) reference when remote context or CI is needed. Select by the actual remote and requested target, not by tool availability alone. For another forge or unclear capabilities, consult current official documentation and web search, verify authentication and permissions, ask before non-equivalent or destructive behavior, and report unsupported operations rather than guessing. These are self-contained references; no other skill is required. Commit and rebase/squash history changes remain separate from the existing `difflab-review` review/address workflow.
