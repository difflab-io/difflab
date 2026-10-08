# Difflab plan help

Use natural language; rigid parser syntax is optional. Examples:

- “Start an intent for a data export” -> scaffold `INTENT.md` and stop for manual input.
- “Plan this feature: add data export” -> use inline intent and scaffold `PLAN.md`.
- “Update the cache plan: split phase two” -> snapshot the old plan before editing it.
- “Go ahead with the cache plan” -> validate readiness and execute in the foreground.
- “Go ahead in the background” -> validate and delegate a native background worker.

For missing setup or MCP tools, follow the [Difflab doctor skill](../../../difflab-doctor/SKILL.md), then return to the selected planning workflow. Init/new can use their documented CLI scaffold commands while MCP remains unavailable.

Safety rules: confirm the checkout and initialized `.difflab` store, infer `YYMMDD-{slug}` only when safe, ask about collisions or ambiguous plans, preserve template headings, and never silently overwrite. Planning does not execute implementation. `go` may update live checkboxes and append progress/failure messages to the sibling physical `logs.txt`; it does not commit.

Dry-run request: show the intended artifact paths and proposed MCP or CLI calls (including setup) without writing files or delegating a worker.
