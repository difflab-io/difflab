# Review: invitation expiry change

- **Revision:** example-change-17
- **Intent:** Reject expired invitations without creating membership.
- **Reviewer:** Example reviewer

## Intent Delivery

The acceptance path checks expiry before membership creation. The resend path was not part of this change.

## Readability

Function names describe outcomes, and the request path is understandable without tracing helpers. Move the expiry guard before token decoding so a mid-level maintainer can see the rejection path at a glance.

## Semantic Organization

Invitation policy belongs in the invitation service, not the HTTP handler. The handler should own transport errors; the service should own token and membership rules.

## Maintainability

The shared expiry helper avoids duplicate rules in request and background paths. No new library or abstraction is needed for this change; formatting and static analysis should remain clean.

## Reliability/Testing

Tests cover expiry at the boundary and a used token. A clock-skew case is missing; add a readable test that checks the server clock source and confirms no membership is created on rejection.

## Performance

One lookup occurs per acceptance; no new unbounded loop is present.

## Security

The response does not reveal whether an address has an account. The recipient is authorized before the token is consumed, tokens are treated as opaque values, and failed acceptance does not create membership.

## Findings

| Severity | Location                | Evidence and impact                               | Required change or question                           |
| -------- | ----------------------- | ------------------------------------------------- | ----------------------------------------------------- |
| consider | `src/invitations.ts:52` | Clock skew near expiry may reject valid requests. | Add a boundary test and document server clock source. |

## Overall Assessment

No blocking issue found in the reviewed path; address the boundary test before release.

## Verification and Limits

- **Checks run:** `bun test src/invitations.test.ts` — passed in this example.
- **Not verified:** Real email delivery and production clock behavior.
