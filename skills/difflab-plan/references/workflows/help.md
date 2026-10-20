# Difflab plan help

Use natural language; rigid parser syntax is optional. Examples:

- “Start an intent for a data export” -> scaffold `INTENT.md` and stop for manual input.
- “Plan this feature: add data export” -> use inline intent and scaffold `PLAN.md`.
- “Update the cache plan: split phase two” -> snapshot the old plan before editing it.
- “Go ahead with the cache plan” -> validate readiness and execute in the foreground.
- “Plan go --commit” -> execute and create scoped commits after checks pass. Retain expected green-CI gates. Push requires separate authorization.
- “Go ahead in the background” -> validate and delegate a native background worker.

Safety rules: confirm the checkout and initialized `.difflab` store, infer `YYMMDD-{slug}` only when safe, ask about collisions or ambiguous plans, preserve template headings, and never silently overwrite. Planning does not execute implementation. Plain foreground `go` does not commit. `--commit` permits scoped commits, and `--bg` also permits the remote steps in its workflow. Keep live checkboxes and the physical `logs.txt` accurate. An unmet CI gate stays incomplete.

Dry-run request: show the intended artifact paths and proposed MCP or CLI calls (including setup) without writing files or delegating a worker.
