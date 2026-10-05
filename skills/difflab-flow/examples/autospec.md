# autospec

## Intent

Create a plan, implement it and review the resulting diff. Review remotely only after explicit opt-in.

## Inputs

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| input | yes | — | Feature intent. |

## Flags

| Flag | Default | Capability | Effect |
| --- | --- | --- | --- |
| --local | false | local | Omit remote review. |
| --commit | false | local-commit | Authorize a scoped local commit only in an explicitly commit-capable procedure; none is selected here. |
| --remote-review | false | remote-review | Permit review new remote mode after explicit forge permission and its own gates. |

## Steps

### 1. draft-plan

- Handler: `plan new`
- When: always
- Unless: never
- Requires: local
- Receives: `{{input}}`
- Produces: `plan_path`
- Instructions: Create an implementation plan for the input; return its verified absolute PLAN.md path. No implementation in this step.

### 2. implement

- Handler: `plan go`
- When: always
- Unless: never
- Requires: local
- Receives: `{{steps.draft-plan.plan_path}}`
- Produces: `diff_ref`
- Instructions: Execute the identified plan in foreground without implicit commit, push or PR; return the verified Git diff or commit reference. Follow plan go checkpoint rules.

### 3. local-review

- Handler: `review new --local`
- When: always
- Unless: `--remote-review`
- Requires: local
- Receives: `{{steps.implement.diff_ref}}`
- Produces: `review_path`
- Instructions: Review the verified diff locally and return its REVIEW.md path; do not publish comments.

### 4. remote-review

- Handler: `review new`
- When: `--remote-review`
- Unless: `--local`
- Requires: remote-review
- Receives: `{{steps.implement.diff_ref}}`
- Produces: `review_path`
- Instructions: Only after separate explicit forge authorization, follow review new's checks and publication rules; no merge. Block if authorization, auth, or supported operation is missing.

## Contract

Use this as an example when creating a definition, not as a request to execute. `--local --remote-review` is contradictory and must be rejected before creating an instance. `--commit` by itself grants no selected step permission to commit; it does not alter plan go's foreground safety. No step provides merge capability.
