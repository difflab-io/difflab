# `poc freeze`

Preserve the PoC as an annotated `poc/<name>` tag, then delete both branches only after confirmation. Never merge. Use full `refs/tags/` and `refs/heads/` names to avoid ambiguity.

Before tagging, read and validate the [PoC code standards completion checklist](../poc-code-standards.md). If deliverables or validation are incomplete, report them and return to `poc new` for repair; do not tag an incomplete experiment silently.

1. Require the current `poc/<name>` branch and a clean tree. Check the README purpose, learnings, and original `base_commit`; it must be an ancestor of HEAD. Save the full HEAD SHA. Fetch the remote branch and tags. If the remote PoC branch is absent or does not match HEAD, stop. Do not push or discard changes silently.
2. If the local or remote tag exists, confirm that it is annotated and points to HEAD on both sides. If it conflicts, stop. Otherwise create an annotated tag at HEAD and push only `refs/tags/poc/<name>:refs/tags/poc/<name>`. Confirm that the remote tag points to HEAD. If it does not, keep both branches. Never force-update a tag.
3. Ask the user to confirm deletion of both local and remote `poc/<name>` branches. If declined, keep them. If confirmed, check the remote branch SHA again. Switch to a safe non-PoC branch, delete the remote branch with a lease against that SHA, and verify its absence. Only then delete the local branch. Use `-D` only when ordinary `-d` refuses because the tagged experiment was never merged.
4. On failure, keep the tag and any remaining branches. Report their SHAs and recovery steps. On success, report the tag, base SHA, deletion results, and `git diff <base_commit> refs/tags/poc/<name>`.
