# Invite teammates to a project

- **Status:** draft
- **Branch:** feature/project-invites
- **Issue:** EX-12

## Intent

Project owners need to invite teammates without sharing credentials. The recipient should know which project they are joining before accepting.

## Requirements

- An owner can send an invite to a valid email address and see its pending state.
- Only the intended recipient can accept; expired invites fail without changing membership.
- Bulk invitations and organization-level roles are out of scope.

## Design

### Big Ideas

Store a single-use invitation tied to project, email, and expiry. Acceptance adds membership in the same transaction that consumes the invitation.

### Interfaces

`POST /projects/:id/invitations` creates a pending invite; `POST /invitations/:token/accept` returns membership or a safe expired/used error.

### Consequences

Email delivery can fail after persistence; queue retries and show a pending invitation. Rate-limit creation to avoid abuse.

## Phases

### Phase 1: Invitation lifecycle

- **Phase ID:** P1
- **Prerequisites:** None
- **Objective:** Owners can invite and recipients can accept safely.
- **Constraints:** Tokens must never appear in application logs.

- [ ] **T1** Persist single-use, expiring invitations and test expiry.
- [ ] **T2** Expose owner creation and recipient acceptance endpoints.

## References

- EX-12 — sample product request.
