# autoreview

## Intent

Review a change and address grounded local findings. Remote review is opt-in; merge is not supported by this flow.

## Inputs

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| input | yes | — | Change or diff to review. |

## Flags

| Flag | Default | Capability | Effect |
| --- | --- | --- | --- |
| --local | false | local | Omit remote review. |
| --remote-review | false | remote-review | Permit remote review only with explicit forge authorization. |
| --commit | false | local-commit | No effect unless a declared commit-capable procedure is later added and separately authorized. |

## Steps

### 1. local-review

- Handler: `review new --local`
- When: always
- Unless: `--remote-review`
- Requires: local
- Receives: `{{input}}`
- Produces: `review_path`
- Instructions: Review the change locally and return a verified REVIEW.md path.

### 2. remote-review

- Handler: `review new`
- When: `--remote-review`
- Unless: `--local`
- Requires: remote-review
- Receives: `{{input}}`
- Produces: `review_path`
- Instructions: Follow review new's remote checks and inline publication rules only with separate explicit authorization; do not merge.

### 3. address-local

- Handler: `review address --local`
- When: always
- Unless: `--remote-review`
- Requires: local
- Receives: `{{steps.local-review.review_path}}`
- Produces: `addressed_diff_ref`
- Instructions: Address verified local requests only; report the diff reference. Follow review address permissions.

### 4. address-remote

- Handler: `review address --local`
- When: `--remote-review`
- Unless: `--local`
- Requires: local
- Receives: `{{steps.remote-review.review_path}}`
- Produces: `addressed_diff_ref`
- Instructions: Address verified remote requests only; do not publish new comments, push or merge without separate authority. Follow review address permissions.

## Contract

Each selected address step depends only on its matching selected review step. `--local --remote-review` is contradictory; reject it. Merge is not a step: a merge request blocks until an independently supported and authorized workflow exists.
