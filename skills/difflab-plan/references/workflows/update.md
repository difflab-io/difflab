# `plan update`

Use this workflow only for an existing plan and supplied feedback.

1. Confirm the checkout and initialized store. Updating existing files does not require the scaffold tool. Select the plan deterministically: supplied name, then one unique active match. If several match or the target is unclear, ask which plan. If feedback is missing or empty, ask what should change and stop.
2. Verify `PLAN.md` exists and is readable. Inspect all numbered `revisions/*.md` files and set `N` to one greater than the highest existing number (or 1 if none), never reuse a gap. Create `revisions/N.md` exclusively (fail rather than overwrite if another writer got there first). Copy the entire current PLAN.md verbatim, then append a final `## Feedback` heading and the supplied feedback. Complete this snapshot before editing the live plan.
3. Read the live plan, apply the feedback while preserving its template headings and phase structure, and write it back. Do not change unrelated files or begin implementation. If snapshot creation fails, do not edit the live plan.

Dry run example:

```text
Feedback: “split the migration phase”
Would reserve .difflab/plans/261005-cache/revisions/3.md,
copy PLAN.md verbatim, append ## Feedback and the feedback, then edit PLAN.md.
No revision is replaced and no implementation starts.
```

Report both exact paths. Missing plans, unsafe paths, existing unreadable revisions, or ambiguous selection are safe failures requiring user input or setup repair.
