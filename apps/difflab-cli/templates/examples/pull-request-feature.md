## Intent

Let project owners invite teammates without sharing credentials.

## Changes

- Added a single-use invitation token with an expiry.
- Added an acceptance endpoint that creates membership and consumes the token atomically.
- Added owner and recipient error handling.

## Validation

- `bun test src/invitations.test.ts` — passed in this example.
- Manual check: expired and already-used tokens did not grant membership.

## References

- Issue: EX-12 (example)

## Further Work

Add invitation resend and cancellation in a separate change.
