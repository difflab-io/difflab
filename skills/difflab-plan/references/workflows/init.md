# `plan init`

Use this workflow when the user wants to start a plan, capture planning intent, or asks to plan without enough detail to write an executable plan.

1. Confirm the absolute checkout root and that it is initialized. Stop on conflicting or inconsistent paths; do not create a substitute store.
2. Choose `YYMMDD-{slug}` under `.difflab/plans/`. Use the supplied name when present; otherwise infer a concise slug from the request. Check for an existing directory before scaffolding. On collision, ask whether to use the existing artifact or choose a different name; never overwrite.
3. Call the scaffold MCP tool with `{name:"planning-intent",cwd:<absolute checkout root>,path:<relative .difflab/plans/... directory>,filename:"INTENT.md"}`. If unavailable, use `difflab templates scaffold planning-intent <relative-directory> INTENT.md --cwd <absolute-root>`. Both interfaces create missing directories and refuse overwrites.
4. Read the generated `INTENT.md`, preserve its headings, and invite the user to fill it manually. Do not fill it with guessed requirements and do not start implementation.

Dry run example (illustrative only):

```text
Request: “plan a cache invalidation feature”
Would scaffold: .difflab/plans/261005-cache-invalidation/INTENT.md
Would call: scaffold({name:"planning-intent", cwd:"/repo", path:".difflab/plans/261005-cache-invalidation", filename:"INTENT.md"})
Then stop and ask the user to complete the intent.
```

Report the exact path and any collision or initialization problem. A dry run performs no MCP write.
