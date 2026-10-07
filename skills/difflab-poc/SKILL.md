---
name: difflab-poc
description: Run isolated, disposable proof-of-concept experiments on poc/* branches; initialize, build, and freeze them as tags.
compatibility: Requires Git, a GitHub/GitLab-compatible forge with enforced merge prevention, and Difflab MCP scaffold.
---

# Difflab PoC

Interpret `poc init [name]`, `poc new [request]`, and `poc freeze` as Agent Skill workflows, not CLI subcommands. Read the corresponding `references/workflows/*.md` before acting. If intent, branch name, or target is unclear, ask; never guess a destructive target.

PoC branches are disposable experiments, not production work. Never merge them into production or open a production PR from them. Confirm the absolute repository root, `origin/main`, current branch, worktree status, and forge before changing anything. `init` and `new` must first verify effective source-branch merge prevention as described in `references/merge-gate.md`. When absent, ask whether the user authorizes configuring it, then **stop** until the remote policy is effective; a checked-in workflow is not a sufficient gate. Do not modify remote policy without explicit authorization.

Use `scaffold({name:"poc-readme",cwd:<absolute checkout root>,path:".",filename:"POC-README.md"})` on a newly created PoC branch, fill it, then replace `README.md` and remove the temporary file. The template cannot scaffold over the existing README. This replacement is limited to the isolated PoC branch; do not discard dirty work. On reuse, retain the existing README and its original `base_commit`. Require a full SHA of the branch point in YAML frontmatter; never recompute it from today's main. The stable diff is `git diff <base_commit> HEAD`.

## Workflows

- `init`: `references/workflows/init.md` — create/reuse branch and initialize README.
- `new`: `references/workflows/new.md` — initialize as needed, then run minimal requested experiments.
- `freeze`: `references/workflows/freeze.md` — tag the tip and safely remove local and remote branches.

A PoC may deliberately delete application files for a from-scratch sandbox, but only when the user explicitly requests that scope, after the branch and clean-tree safety checks. No generic cleanup or force-push; do not auto-commit/push without separate authorization except the tag push expressly required by an approved `freeze`. Remote deletion requires an explicit confirmation. Report the branch, base SHA, readme, verification, tag, and any recovery steps.
