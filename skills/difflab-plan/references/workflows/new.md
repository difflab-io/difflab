# `plan new`

1. Confirm the absolute checkout root and initialized `.difflab` store, following the [Difflab setup skill](../../../difflab-setup/SKILL.md) when needed. Select a supplied plan name first; otherwise use a unique matching intent/plan or infer a short slug from the inline request. If several candidates match, ask. An existing directory with only INTENT.md is a valid `new` target; an existing PLAN.md must not be overwritten (offer `plan update` instead).
2. If INTENT.md exists, read its filled content. If there is no usable inline request or filled intent, ask what to plan and offer context-derived choices before creating PLAN.md. Inline requests do not require or create INTENT.md; `plan init` is the separate manual-intent path. If the inline request conflicts with filled intent, ask which wins.
3. Prefer the exposed MCP tool: `scaffold({name:"spec-driven-plan",cwd:<absolute checkout root>,path:".difflab/plans/YYMMDD-{slug}",filename:"PLAN.md"})`. If unavailable, follow setup recovery and use `difflab templates scaffold spec-driven-plan .difflab/plans/YYMMDD-{slug} PLAN.md --cwd <absolute-root>` within current authorization. Read the resulting template and its headings. Do not remove required headings. Fill the plan from the request and/or intent, retaining all applicable sections and phase checkboxes.
4. Leave implementation unchecked and do not delegate work. Report the exact PLAN.md path and INTENT.md only if one exists.

Dry run example:

```text
Request: “plan new audit export”
Would scaffold only .difflab/plans/261005-audit-export/PLAN.md from the inline request.
Would fill the template from the request, preserving headings; no worker or source edit runs.
```

A supplied request takes precedence over stale or conflicting intent only after showing the conflict and asking for clarification. Never silently overwrite either file.
