---
base_commit: '{{full SHA of origin/main at branch creation}}'
---

# PoC: {{name}}

> Experimental branch only. Do not merge into production or publish as a release.

## Purpose

{{Question to answer and the smallest useful success criterion.}}

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
