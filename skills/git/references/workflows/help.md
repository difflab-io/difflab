# Git skill help

These are natural-language requests handled by the `git` skill, not new Git subcommands.

| Request                      | Behavior                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| Commit changes, `git commit` | Review and create conventional commits locally; optional `--push`                  |
| Rebase branch, `git rebase`  | Snapshot branch intent and replay onto an updated base; optional `--push`          |
| Squash commits, `git squash` | Recompose a branch into coherent changelog-ready commits; optional `--push`        |
| Sync branches, `git sync`    | Fetch origin and reconcile the current branch and local main; never push           |
| Branch or worktree           | Create or switch a branch and/or create a linked worktree when requested           |
| Exclude a path locally       | Add, list, or remove a local exclude pattern without changing tracked ignore rules |
| Git help                     | Explain supported actions without modifying the repository                         |

A request to push is explicit, never inferred from a previous workflow. `--push` on rebase or squash authorizes only a lease-protected update of an eligible rewritten feature branch, subject to confirmation and verification. Commit pushes use a normal non-forced update. No request here authorizes rewriting protected branches, dropping commits, or replacing another user's work. If a request does not match these workflows, explain the available actions or ask what the user intends; do not fall back to another skill's commands.

GitHub and GitLab guidance is in the local [GitHub](../forges/github.md) and [GitLab](../forges/gitlab.md) references. For another forge or missing functionality, follow the research-and-confirm guidance in [the dispatcher](../../SKILL.md).
