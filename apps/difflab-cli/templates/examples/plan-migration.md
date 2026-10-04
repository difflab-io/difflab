# Move activity history to a new store

- **Status:** draft
- **Branch:** feature/activity-migration
- **Issue:** EX-27

## Intent

Readers should retain access to historical activity while the team changes storage engines without downtime.

## Requirements

- Old and new records produce the same user-visible history, order, and cursors.
- Rollback can restore the prior reader without losing activity written during migration.
- No reader switches until backfill and comparison pass.

## Design

### Big Ideas

Write to both stores temporarily, backfill older records with stable IDs, compare counts and ordering, then switch readers behind a reversible flag. Keep the legacy reader authoritative until the new store is verified.

### Infrastructure Changes

Provision the new activity store and credentials before dual writes. Retain the legacy store and its capacity until the rollback window closes; monitor write failures for each store separately.

### Interfaces

`listActivity(projectId, cursor)` preserves ordering and cursor behavior during cutover. `src/activity/writer.ts` owns dual writes, `src/activity/backfill.ts` copies historical records, and `src/activity/reader.ts` selects the store behind the feature flag.

### Consequences

Dual writes increase latency and create a risk of partial failure. Record discrepancies and retry failed writes instead of hiding them. Removing the legacy store is outside this plan.

## Phases

### Phase 1: Provision and dual-write

- [ ] Provision the new store and credentials; add write-failure metrics for both stores.
- [ ] Make `src/activity/writer.ts` write idempotently to both stores with stable activity IDs while retaining the legacy reader.
- [ ] Test partial-write retries and duplicate events in `src/activity/writer.test.ts`.
- [ ] Validation
  - [ ] Run writer tests, lint, and format checks; confirm write-failure metrics are visible.
  - [ ] Commit this phase and confirm CI is green.

### Phase 2: Backfill and compare

- [ ] Add resumable, idempotent batches in `src/activity/backfill.ts` without replacing newer dual-written records.
- [ ] Compare record IDs, counts, and ordering per project; report mismatches before any reader switch.
- [ ] Add backfill restart and parity tests in `src/activity/backfill.test.ts`.
- [ ] Validation
  - [ ] Run backfill and writer tests, lint, and format checks; review mismatch reports.
  - [ ] Commit this phase and confirm CI is green.

### Phase 3: Switch reads with rollback

- [ ] Route `listActivity(projectId, cursor)` through a reversible flag in `src/activity/reader.ts` and preserve cursor compatibility.
- [ ] Test new-store reads, cursor boundaries, and rollback to the legacy reader in `src/activity/reader.spec.ts`.
- [ ] Keep dual writes and monitor parity through the rollback window.
- [ ] Validation
  - [ ] Run unit and integration tests, lint, and format checks; verify flag rollback.
  - [ ] Commit this phase and confirm CI is green.

## References

- EX-27 — sample migration request.
