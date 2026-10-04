# Move activity history to a new store

- **Status:** draft
- **Branch:** feature/activity-migration
- **Issue:** EX-27

## Intent

Readers should retain access to historical activity while the team changes storage engines without downtime.

## Requirements

- Old and new records produce the same user-visible history.
- Rollback can restore the prior reader without losing new activity.

## Design

### Big Ideas

Write to both stores temporarily, backfill older records with stable IDs, compare counts, then switch readers behind a flag.

### Interfaces

`listActivity(projectId, cursor)` preserves ordering and cursor behavior during cutover.

### Consequences

Dual writes increase write latency; track failures separately and do not hide discrepancies.

## Phases

### Phase 1: Backfill and compare

- **Phase ID:** P1
- **Prerequisites:** None
- **Objective:** Every record exists in both stores and mismatches are visible.
- **Constraints:** The legacy reader remains authoritative until comparison passes.

- [ ] **T1** Add idempotent dual writes with failure metrics.
- [ ] **T2** Backfill and compare record IDs and order.

### Phase 2: Switch reads

- **Phase ID:** P2
- **Prerequisites:** P1
- **Objective:** Serve history from the new store with a tested rollback.
- **Constraints:** Preserve cursor compatibility.

- [ ] **T3** Switch readers behind a reversible flag and verify counts.

## References

- EX-27 — sample migration request.
