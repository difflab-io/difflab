# Review: invitation expiry change

- **Revision:** example-change-17
- **Intent:** Reject expired invitations without creating membership.
- **Reviewer:** Example reviewer

## Intent Delivery

The acceptance path checks expiry before membership creation. The resend path was not part of this change.

## Readability

Function names describe outcomes; the expiry check would be easier to follow before token decoding.

## Semantic Organization

Invitation policy belongs in the invitation service, not the HTTP handler.

## Maintainability

The shared expiry helper keeps request and background paths consistent.

## Quality and Tests

Tests cover expiry at the boundary and a used token. The behavior for clock skew is not covered.

## Performance

One lookup occurs per acceptance; no new unbounded loop is present.

## Security

The response does not reveal whether an address has an account. Tokens are compared as opaque values.

## Findings

| Severity | Location                | Evidence and impact                               | Required change or question                           |
| -------- | ----------------------- | ------------------------------------------------- | ----------------------------------------------------- |
| consider | `src/invitations.ts:52` | Clock skew near expiry may reject valid requests. | Add a boundary test and document server clock source. |

## Overall Assessment

No blocking issue found in the reviewed path; address the boundary test before release.

## Verification and Limits

- **Checks run:** `bun test src/invitations.test.ts` — passed in this example.
- **Not verified:** Real email delivery and production clock behavior.
