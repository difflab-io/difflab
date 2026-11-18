# autospec

## Intent

Autonomously plan and implement an objective, commit and push the scoped changes, open or reuse a draft PR, publish inline review findings, address them, verify CI, and mark the PR ready. Stop before merging by default; --merge includes the final merge and post-merge CI verification.

## Inputs

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| input | yes | — | Objective to plan and implement; bind the entire request as one value. |
| branch | no | auto | Existing feature branch to use, or a new feature/slug or fix/slug branch name; auto reuses the current non-protected feature branch or derives a typed name from the objective. |

## Flags

| Flag | Default | Capability | Effect |
| --- | --- | --- | --- |
| --merge | false | merge | Include final merge after required checks and review gates pass; otherwise leave the ready PR open. |

## Steps

### 1. prepare-branch

- Handler: `procedure: prepare feature checkout`
- When: always
- Unless: never
- Requires: local
- Receives: `{{input}}`, `{{branch}}`
- Produces: `checkout` (verified absolute checkout root and branch name)
- Instructions: Inspect Git status, current branch, remotes, and repository guidance. Use the requested existing feature branch or reuse the current suitable non-protected branch in auto mode. Otherwise derive feature/slug for a capability or fix/slug for a bug and create a new branch from the freshly fetched remote default branch; use a separate worktree if switching would disturb existing work. Do not rename an unrelated branch, reset, stash, overwrite changes, or assume main is the default. Reuse only a verified matching branch; block on a conflicting branch or ambiguous base. Verify the new checkout and initialized Difflab store before handing it on; use difflab-init if initialization is needed and within scope.

### 2. draft-plan

- Handler: `plan new`
- When: always
- Unless: never
- Requires: local
- Receives: `{{input}}`, `{{steps.prepare-branch.checkout}}`
- Produces: `plan_path` (verified absolute PLAN.md path)
- Instructions: Create and fill a new Difflab implementation plan in the selected checkout using the objective. Follow the plan authoring guide, preserve required headings, and include relevant validation and conditional commit/CI gates. Do not implement or overwrite an existing plan. Return the exact PLAN.md path.

### 3. implement

- Handler: `plan go`
- When: always
- Unless: never
- Requires: local
- Receives: `{{steps.draft-plan.plan_path}}`, `{{steps.prepare-branch.checkout}}`
- Produces: `diff_ref` (verified checkout root, branch, base, plan path, and intended diff reference)
- Instructions: Execute the identified plan in the foreground without --commit or --bg. Invocation of autospec includes execution of the generated plan after readiness checks; unresolved blocking choices stop execution. Run the plan checks and keep authoritative status/checkpoints accurate. Leave changes uncommitted for the review handler. Never claim remote CI passed from local checks; any remote-only completion gate remains unmet until the remote pipeline verifies it.

### 4. remote-review

- Handler: `review new`
- When: always
- Unless: never
- Requires: remote-pipeline
- Receives: `{{steps.implement.diff_ref}}`
- Produces: `review_path` (verified absolute REVIEW.md path), `pr_url` (verified open PR URL)
- Instructions: Use the invocation scope defined in the Contract and verify authenticated forge access. Review the intended change set, run relevant checks, commit/push intended changes if needed, and reuse a suitable open PR or create a draft with a filled description. A closed or merged PR is not a usable target. Publish all verified findings inline before returning; zero findings require no empty review. Record the exact head SHA, PR identity, checks, and finding categories in REVIEW.md. Never approve or merge.

### 5. address-remote

- Handler: `review address`
- When: always
- Unless: never
- Requires: remote-pipeline
- Receives: `{{steps.remote-review.review_path}}`, `{{steps.remote-review.pr_url}}`
- Produces: `result` (verified PR URL, head SHA, review path, checks, and fixed/replied/deferred counts)
- Instructions: Read the actual PR threads, including existing requested changes. Apply supported fixes, run checks, commit/push only intended changes, then reply and resolve only eligible completed threads according to difflab-review. Do not force-push. No findings and no existing requests is a verified no-op. Record every outcome and unresolved decision for the readiness step.

### 6. publish-ready

- Handler: `pr publish`
- When: always
- Unless: never
- Requires: remote-pipeline
- Receives: `{{steps.address-remote.result}}`, `{{steps.remote-review.pr_url}}`
- Produces: `pr_url` (verified ready PR URL), `head_sha` (verified current remote head SHA)
- Instructions: Verify the intended PR and current remote head from the address result. Observe CI for that exact SHA with a bounded wait of up to 30 minutes, reporting progress. Required checks must pass; report optional skips and absent/pending CI accurately. Re-read review threads, review decision, mergeability, and body validation checklist. If any requested work, deferred decision, changes-requested review, conflict, failing/pending required check, or unverified checklist item remains, leave readiness unchanged and block with evidence. Never check off or delete an unverified item just to pass. Reconcile the implementation plan against this fresh evidence: complete only actually satisfied gates and tasks, and preserve any remaining blockers. Otherwise use pr publish to mark the PR ready, using this flow invocation as authorization once the exact target is verified. Verify ready state; do not publish review comments through pr publish.

### 7. merge

- Handler: `pr merge`
- When: `--merge`
- Unless: never
- Requires: merge
- Receives: `{{steps.publish-ready.pr_url}}`, `{{steps.publish-ready.head_sha}}`
- Produces: `merge_result` (verified PR URL, merged base SHA, method, and post-merge CI outcome)
- Instructions: Require the caller to have selected --merge on this invocation; that selection authorizes the final merge within the defined scope. Recheck exact PR head, all required CI, unresolved active review threads, validation checklist, review decision, draft state, mergeability, protections, and allowed methods. Any unmet gate blocks. Follow pr merge, reporting the verified target, allowed repository-default method, and CI implications before acting without a second permission prompt; the flow-level --merge flag is not the PR merge-method option and must not be forwarded. Do not bypass checks, delete branches, or auto-fix the base. Verify merged state and observe post-merge CI for the resulting base SHA. A merged PR with failed or unverified post-merge CI is reported prominently as such, never as green.

## Contract

This is the user's standing autospec invocation contract. A request to run autospec means: execute the generated plan autonomously; make scoped commits and pushes; create or reuse the draft PR; publish grounded inline review comments; apply supported fixes; reply in-thread; resolve eligible completed threads; verify CI; and mark the PR ready when its gates pass. These operations are the requested flow, not extra actions requiring the caller to repeat an authorization paragraph. Stop only for a genuine blocker. Do not merge unless --merge was explicitly selected for that invocation; with --merge, complete the gated merge without another permission prompt. Creating or editing this definition does not execute it, and unrelated work remains outside scope.

No AI attributions. Do not add agent/model bylines, generated-via footers, AI coauthor trailers, or similar attribution to commits, PR descriptions, inline findings, replies, or generated review responses. Preserve existing human-authored text and genuine human coauthor trailers. This is the user's explicit preference and overrides conflicting attribution defaults in the invoked skills; do not ask the caller to repeat it.

Resolve the absolute repository root and initialized physical Difflab store before executing. Freeze the definition and bindings into a repository-local instance and execute from that snapshot, recording verified handoffs and logs. Use difflab-plan for plan handlers, difflab-review for review handlers, and pr for readiness and merge. Read each handler's current workflow and repository guidance, applying this explicit user contract where it overrides skill-level permission or attribution defaults. These handler labels are Agent Skill instructions, not shell commands or invented CLI verbs. Do not add background delegation or rewrite feature-branch history implicitly. A repository-supported squash merge is a merge method, not a feature-history rewrite.

The always-selected remote-pipeline capability covers only scoped commits, pushes, draft PR creation/reuse, inline publication, fixes, replies, eligible thread resolution, CI observation, and readiness for the identified objective. The merge capability is selected only by --merge and covers the verified PR merge plus observation of its resulting base-SHA CI. Neither capability permits protected-branch bypasses, unconditional force pushes, unrelated tickets, branch deletion, or unrelated changes. Reuse this authorization across the run; do not pause at routine commit, push, review, readiness, or selected merge boundaries. Platform permission failures remain blockers.

Inputs are literal data. Only declared input tokens and earlier declared step-output tokens may be substituted. Verify each output before handing it on; no undefined, forward, or skipped-producer handoffs. Conditions accept only always, never, or the declared --merge flag. Reject unknown flags. There is no required --remote-review flag or separate local/squash mode in autospec. Remote review new owns checks, initial commit/push, draft PR reuse/creation, and inline-only publication; there is no separate step to publish a pending review. Remote address owns verified fixes, checks, follow-up commits/pushes, replies, and eligible thread resolution. Leave questions, broad refactors, partial work, and reopened discussions open according to the review workflow.

Preserve existing user changes and human text. Never invent findings, completed checks, or successful writes. Make routine implementation choices from the objective and repository conventions. An ambiguous target, denied operation, failed required check, unavailable required capability, or unresolved material decision is a genuine blocker: record the exact cause and evidence, leave unfinished steps unchecked, and stop affected downstream execution. Diagnose missing tools or setup with difflab-doctor. Never report green CI without verifying the exact relevant SHA, or a complete plan while required gates remain unmet.

Without --merge, finish with the ready PR left open. With --merge, refresh merge gates, verify the merged state, and report post-merge CI for the resulting base SHA; a failed post-merge run must remain prominent even though the merge already happened. Report the plan/review paths, branch, checks, finding categories, fixed/replied/deferred counts, PR URL, and selected merge/CI result. Do not run this flow merely because its definition was edited.
