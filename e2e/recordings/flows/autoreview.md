# autoreview

## Intent

Run one review/address round for an existing change. Remote mode opens or reuses its draft PR, publishes verified inline findings, applies supported fixes, and marks it ready only after validation and review gates pass. This replaces Codevoyant's separate review-publish steps with Difflab's integrated inline publication.

## Inputs

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| input | no | current branch diff | Explicit PR URL, plan path, issue, branch, or diff to review; default to the current feature branch's intended diff. |

## Flags

| Flag | Default | Capability | Effect |
| --- | --- | --- | --- |
| --local | false | local | Explicitly select the default local review/address path; incompatible with --remote-review. |
| --remote-review | false | remote-review | Select remote review/address and readiness, subject to independent authorization for their commit and forge operations. |

## Steps

### 1. local-review

- Handler: `review new --local`
- When: always
- Unless: `--remote-review`
- Requires: local
- Receives: `{{input}}`
- Produces: `review_path` (verified absolute REVIEW.md path)
- Instructions: Review the identified diff against repository guidance and intent. Record grounded findings and checks in REVIEW.md. Always retain the review artifact, including a zero-findings result. Do not create a duplicate review, publish comments, or mutate Git history.

### 2. remote-review

- Handler: `review new`
- When: `--remote-review`
- Unless: `--local`
- Requires: remote-review
- Receives: `{{input}}`
- Produces: `review_path` (verified absolute REVIEW.md path), `pr_url` (verified open PR URL)
- Instructions: Verify independently authorized remote scope and authenticated forge access. Review the intended change set, run relevant checks, commit/push intended changes if needed, and reuse a suitable open PR or create a draft with a filled description. A closed or merged PR is not a usable target. Publish all verified findings inline before returning; zero findings require no empty review. Record the exact head SHA, PR identity, checks, and finding categories in REVIEW.md. Never approve or merge.

### 3. address-local

- Handler: `review address --local`
- When: always
- Unless: `--remote-review`
- Requires: local
- Receives: `{{steps.local-review.review_path}}`
- Produces: `result` (verified review path, diff reference, checks, and fixed/replied/deferred counts)
- Instructions: Address actual requests in the identified local review, verify changes with focused checks, and record every response/status in REVIEW.md. If there are no requests, record a verified no-op. Keep changes uncommitted. Report the review path, finding categories, outcomes, checks, and any remaining decisions.

### 4. address-remote

- Handler: `review address`
- When: `--remote-review`
- Unless: `--local`
- Requires: remote-review
- Receives: `{{steps.remote-review.review_path}}`, `{{steps.remote-review.pr_url}}`
- Produces: `result` (verified PR URL, head SHA, review path, checks, and fixed/replied/deferred counts)
- Instructions: Read the actual PR threads, including existing requested changes. Apply supported fixes, run checks, commit/push only intended changes, then reply and resolve only eligible completed threads according to difflab-review. Do not force-push. No findings and no existing requests is a verified no-op. Record every outcome and unresolved decision for the readiness step.

### 5. publish-ready

- Handler: `pr publish`
- When: `--remote-review`
- Unless: `--local`
- Requires: remote-review
- Receives: `{{steps.address-remote.result}}`, `{{steps.remote-review.pr_url}}`
- Produces: `pr_url` (verified ready PR URL), `head_sha` (verified remote head SHA)
- Instructions: Verify the intended PR and current remote head from the address result. Observe CI for that exact SHA with a bounded wait of up to 30 minutes, reporting progress. Required checks must pass; report optional skips and absent/pending CI accurately. Re-read review threads, review decision, mergeability, and body validation checklist. If any requested work, deferred decision, changes-requested review, conflict, failing/pending required check, or unverified checklist item remains, leave readiness unchanged and block with evidence. Never check off or delete an unverified item just to pass. Otherwise use pr publish to mark the PR ready, respecting its target-confirmation rules and existing session authorization. Verify ready state; do not publish review comments through pr publish.

## Contract

This is a reusable global definition adapted from the matching ~/.codevoyant flow, not an execution request or authorization. Snapshot it before a run; never store run state here. Resolve the absolute repository root and initialized physical Difflab store before executing. Use difflab-plan for plan handlers, difflab-review for review handlers, git for history cleanup, and pr for ready/merge actions. Read each handler's current workflow and applicable repository guidance. Procedures are instructions for the agent, not shell commands or invented CLI verbs.

Inputs are literal data. Only declared input tokens and earlier declared step-output tokens may be substituted. Verify each output before handing it on; no undefined, forward, or skipped-producer handoffs. Conditions accept only always, never, or one declared flag. Reject unknown flags. Reject --local together with --remote-review. Default execution is local. Remote review requires --remote-review plus independent authorization for scoped commits, pushes, draft PR creation, inline comments, replies, and eligible thread resolution. Confirm the exact target and scope once at run start where needed; reuse existing session authorization. Definitions and defaults grant no permissions. Never pass flow flags blindly to a handler or silently select --bg.

Local review/address may edit source and REVIEW.md but must not commit, push, create tickets, or write to a forge. Remote review new owns check-before-commit/push, draft PR reuse/creation, and inline-only publication; there is no separate step to publish a pending review. Remote address owns fixes, checks, scoped follow-up commits/pushes, replies, and eligible thread resolution. Leave questions, broad refactors, partial work, and reopened discussions open. Preserve human text and follow higher-priority user instructions, including attribution preferences. Never invent model identity, findings, completed checks, or successful writes.

An ambiguous target, denied operation, failed check, missing capability, or unresolved required decision blocks the affected step and downstream consumers. Record evidence and the exact blocker; do not claim success or silently fall back to another mode. Follow difflab-flow logging and checkpoint rules. Diagnose missing tools or setup with difflab-doctor. Foreground execution may request a genuinely missing decision; do not prohibit necessary questions. No native delegation is required by these definitions.

This flow performs one review/address round, not an unbounded loop. It never squashes, approves, merges, or deletes a branch. Report a terse completion line, finding categories/counts, fixed/replied/deferred counts, checks, and the review path or PR URL with its verified ready/draft state. If readiness is blocked, say the review round is partial and identify the remaining decision or failed check; do not claim the entire flow completed.
