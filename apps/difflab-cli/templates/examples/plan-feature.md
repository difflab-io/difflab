# Invite teammates to a project

- **Status:** draft
- **Branch:** feature/project-invites
- **Issue:** EX-12

## Intent

Project owners need to invite teammates without sharing credentials. Recipients should know which project they are joining before accepting.

## Requirements

- An owner can send an invite to a valid email address and see its pending state.
- Only the intended recipient can accept; expired or used invites fail without changing membership.
- Bulk invitations and organization-level roles are out of scope.

## Design

### Big Ideas

Store a single-use invitation tied to project, email, and expiry. Acceptance adds membership in the same transaction that consumes the invitation. Queue delivery after saving the invite so a temporary email failure cannot lose it.

### Interfaces

`POST /projects/:id/invitations` creates a pending invite; `POST /invitations/:token/accept` returns membership or a safe expired/used error. `src/invitations/store.ts` owns persistence; `src/invitations/service.ts` owns eligibility, expiry, and token consumption; `src/http/invitations.ts` maps results to responses.

### Consequences

Email delivery can fail after persistence, so queue retries and show a pending invitation. Rate-limit creation to avoid abuse. Resend and cancellation are deferred.

## Phases

### Phase 1: Persist and consume invitations

- [ ] Add a unique token hash, recipient email, project ID, expiry, and consumed timestamp to invitation storage in `src/invitations/store.ts`; never log raw tokens.
- [ ] Implement transactional membership creation and token consumption in `src/invitations/service.ts`; reject expired, used, or wrong-recipient tokens without a membership change.
- [ ] Add boundary, repeat-use, and rollback tests in `src/invitations/service.test.ts`.
- [ ] Validation
  - [ ] Run invitation unit tests, lint, and format checks.
  - [ ] Commit this phase and confirm CI is green.

### Phase 2: Expose and deliver invitations

- [ ] Add owner creation and recipient acceptance handlers in `src/http/invitations.ts` with safe error responses and creation rate limits.
- [ ] Queue delivery after persistence, retry transient mail failures, and expose the pending state to owners.
- [ ] Add endpoint integration tests for authorization, expiry, used tokens, and delivery failures in `src/http/invitations.spec.ts`.
- [ ] Validation
  - [ ] Run unit and integration tests, lint, and format checks.
  - [ ] Commit this phase and confirm CI is green.

## References

- EX-12 — sample product request.
