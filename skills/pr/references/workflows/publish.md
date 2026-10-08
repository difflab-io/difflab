# Mark a draft ready

Resolve the explicit PR/MR or the unique open one for the current branch. Confirm its repository, base and head, URL, and draft state through [provider](../providers/index.md) metadata. If it is already ready, report that nothing changed. If it is closed or merged, stop. If several candidates match, ask which one.

Explain that this action changes only the PR/MR's ready state. Pending review comments and draft notes remain unpublished, and no local commits are pushed. Warn about known unpushed changes or failing checks without silently performing another action. Confirm the target before changing its state, then verify and report the ready state and URL. On failure report the forge error without claiming reviews were submitted. For submitting pending comments, use [approve](approve.md), [reject](reject.md), or [comment](comment.md) instead; do not preserve the source skill's combined publish behavior.
