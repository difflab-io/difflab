# Review: invitation acceptance

- **Revision:** illustrative-change-17
- **Intent:** Accept valid invitations without changing membership on rejection.
- **Reviewer:** Authored example, not an executed review.
- **Mode:** Normal, single model.

## Intent Delivery

Acceptance lacks a saved-membership check. See [request 2](#request-2).

## Readability

A query-like name hides a write. See [request 1](#request-1).

## Semantic Organization

The handler maps requests. The service owns acceptance. The store saves membership.

## Maintainability

The service reuses invitation status without adding duplicate state.

## Reliability/Testing

See [request 2](#request-2).

## Documentation

The changed API comment explains token consumption.

## Performance

No material regression found by inspection. No performance measurements ran.

## Security

Not selected. No security audit is claimed.

## Change Requests

### Request 1

- **Status:** open
- **Request:** `src/invitations/service.ts:42`: `loadInvitation` also writes membership. I suggest `acceptInvitation` so callers see the write.

> Generated via [actual runtime model; illustrative placeholder only]

### Request 2

- **Status:** open
- **Request:** `src/invitations/service.spec.ts:18`: Helper tests do not establish saved membership. Let's test acceptance and rejection through the public API, then read membership back.

> Generated via [actual runtime model; illustrative placeholder only]

## Findings

| Severity | Location             | Request                 |
| -------- | -------------------- | ----------------------- |
| consider | `service.ts:42`      | [Request 1](#request-1) |
| consider | `service.spec.ts:18` | [Request 2](#request-2) |

## Overall Assessment

Address the two requests. No unrelated cleanup is needed.

## Verification and Limits

- **Checks run:** None. This is a fictional example.
- **Not verified:** Execution and real repository guidance.
- **Rubric:** A real review links its filled rubric here.
- **Council:** Not selected.
