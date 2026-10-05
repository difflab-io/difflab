# `plan go`

`go` executes an approved plan; it is not another planning or dry-run step.

1. Resolve one plan by supplied name, then unique active match. Ask when ambiguous. Read `PLAN.md` and validate that it is ready: required headings exist, intent is concrete, and no prerequisite approval or unresolved blocking decision remains. An explicit `go` authorizes a draft plan after this check. Mark the live status `in progress` before work starts; if validation fails leave the plan unchanged and report why.
2. By default execute in the foreground (directly or via a foreground worker). With `--bg`, delegate a native background subagent and return control immediately. If the client has no background capability, do not fake it: explain the limitation and offer foreground execution.
3. The worker must update the live phase checkbox as each bounded phase actually completes, not at delegation time. A checkbox is evidence of completion, not a progress log. Keep authoritative status in `PLAN.md`.
4. Resolve the sibling physical `logs.txt` path from `.difflab` and call the new MCP `log_append` tool with exactly `{path:<absolute physical logs.txt>,message:<single human-readable line>}` for every meaningful success and failure. Never write logs directly, pass the symlink path, or treat a log entry as completion. Use messages such as `Phase 1 started`, `Phase 1 complete`, or `Phase 1 failed: <reason>`.
5. Mark status `completed` only after every required task and check passes. On completion, report the plan path, changed files, checkbox updates, and log path. On failure, append a failure line, mark the plan blocked, leave incomplete checkboxes unchecked, and report the exact blocker. Do not commit or push unless separately authorized.

Dry run examples:

```text
“go ahead” -> validate PLAN.md, delegate one foreground worker, then report progress.
“go ahead in the background” / “plan go --bg” -> validate, delegate a native background worker, return immediately.
```

A background request must not be implemented by merely claiming work is scheduled. Keep the handoff explicit and leave the user a way to inspect the live plan and logs.
