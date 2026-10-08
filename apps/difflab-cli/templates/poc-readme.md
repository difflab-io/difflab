---
base_commit: '{{full SHA of origin/main at branch creation}}'
---

# PoC: {{name}}

> Experimental branch only. Do not merge into production or publish as a release.

## Purpose

{{Question to answer and the smallest useful success criterion.}}

## Setup and tasks

{{Tool versions, dependency installation, environment inputs, and required services.}}

| Task             | Command                   | Purpose                                           | Observed result              |
| ---------------- | ------------------------- | ------------------------------------------------- | ---------------------------- |
| Build            | `mise run {{build-task}}` | {{Build the experiment}}                          | {{Actual result or pending}} |
| Test             | `mise run {{test-task}}`  | {{Validate the experimental behavior}}            | {{Actual result or pending}} |
| Run {{approach}} | `mise run {{run-task}}`   | {{Run this prototype; repeat for every approach}} | {{Actual result or pending}} |

{{Explain any genuinely inapplicable build/test task and its alternative validation. Identify unrun checks explicitly.}}

## Code map

{{Focused submodules, their responsibilities and small public APIs, entrypoints, and minimal examples. Keep the experiment direct and avoid speculative abstractions or giant implementation files.}}

## Alternatives

- {{Alternative or variation to compare, if any.}}

## Experiments

| Approach     | What changed | How to run    | Result          |
| ------------ | ------------ | ------------- | --------------- |
| {{approach}} | {{scope}}    | `{{command}}` | {{observation}} |

## Learnings

- {{Evidence-based result, caveat, and what remains unknown.}}

## Compare with main at branch creation

The `base_commit` is the full SHA of `origin/main` when this branch was created; do not update it when main moves. Compare this PoC with its starting point using `git diff <base_commit> HEAD`.

## Disposition

{{Follow-up decision or experiment; freeze with an annotated tag, never merge this branch.}}
