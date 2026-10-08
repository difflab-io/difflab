---
name: poc
description: Create isolated proof-of-concept branches and freeze them as tags.
compatibility: Requires Git and Difflab MCP scaffold or CLI scaffolding.
---

# PoC

Use `poc init [name]`, `poc new [name] [experiment]`, or `poc freeze`. These are skill requests, not CLI commands. `poc new auth` keeps the name and asks what to test. `poc new auth: compare two login flows` supplies both. Read the selected workflow before acting. For init/new, also read [PoC code standards](references/poc-code-standards.md); freeze validates its completion checklist.

A PoC is an experiment, not production work. Never merge it or open a production PR from it. This is a skill policy: users remain responsible for not manually merging PoC branches. Do not require or configure PoC-specific branch protection, permissions, or blocking CI. Confirm the repository, `origin/main`, branch, and clean worktree.

On a new PoC branch, scaffold `poc-readme` as `POC-README.md`, fill it, then replace the branch's `README.md`. Keep its full original `base_commit` in frontmatter. On reuse, never change that value. Compare with `git diff <base_commit> HEAD`.

- `init`: `references/workflows/init.md`
- `new`: `references/workflows/new.md`
- `freeze`: `references/workflows/freeze.md`

Remove broad code only when the user requests a from-scratch experiment. Never discard dirty work. Do not commit or push without separate authorization, except the tag push in `freeze`. Ask before deleting the remote branch. Report the branch, base SHA, checks, tag, and recovery steps.
