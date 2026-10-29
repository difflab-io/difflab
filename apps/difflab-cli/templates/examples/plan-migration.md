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

```mermaid
flowchart LR
  Writer["Activity writer"] --> Old["Legacy store"]
  Writer -->|"new dual write"| New["New store"]
  Old --> Backfill["Resumable backfill"] --> New
  Reader["Public history reader"] --> Flag{"Read flag"}
  Flag -->|"default / rollback"| Old
  Flag -->|"after parity check"| New
```

Stable IDs make retries safe. Track failed writes so comparison cannot silently treat missing data as a successful migration.

```mermaid
flowchart TD
  Provision["Provision store and credentials"] --> Dual["Enable dual writes"]
  Dual --> Backfill["Backfill in restartable batches"]
  Backfill --> Compare{"IDs, order,<br/>and cursors match?"}
  Compare -->|"no"| Repair["Report and repair; keep old reader"] --> Backfill
  Compare -->|"yes"| Switch["Switch read flag; keep dual writes"]
  Switch --> Rollback["Rollback: select old reader<br/>without losing new writes"]
```

### Infrastructure Changes

Provision the new activity store and credentials before dual writes. Retain the legacy store and its capacity until the rollback window closes; monitor write failures for each store separately.

### Interfaces

```text
writeActivity(event)                 -> stable ID; retry failed destination writes
backfillActivity(projectId, cursor)  -> checkpoint + discrepancy report
listActivity(projectId, cursor)      -> same records, order, and cursor contract
readSource = legacy | new            # reversible; legacy remains default
```

### Consequences

#### Repo Changes

Illustrative paths: `[M]` modified, `[A]` added, `[D]` deleted. No files are removed. `writer.ts` and `backfill.ts` contain the largest edits.

```text
infra/
└── [A] activity-store.tf            store, credentials, write-failure metrics
src/
└── activity/
    ├── [M] writer.ts                dual writes and retries
    ├── [A] backfill.ts              resumable batches and comparison
    ├── [M] reader.ts                reversible read source
    ├── [A] migration.spec.ts        public API parity and restart scenarios
    └── [M] history.spec.ts          application history across cutover/rollback
```

#### Testing

```text
Application behavior (hypothetical existing suite)
└── activity history
    ├── write and page history across cutover -> same records and cursors
    └── write after cutover, then roll back -> no lost events
Public module behavior (hypothetical existing suite)
└── activity storage
    ├── retry a failed destination -> one logical event in each store
    └── interrupt and resume backfill -> same IDs and order; no duplicates
```

Use `src/activity/history.spec.ts` for application scenarios and `src/activity/migration.spec.ts` for public storage APIs with real test stores.

#### Trade-offs

Dual writes increase latency and allow partial failure. Record discrepancies and retry failed writes instead of hiding them. Removing the legacy store is outside this plan.

## Phases

### Phase 1: Provision and dual-write

- [ ] Provision the new store and credentials; add write-failure metrics for both stores.
- [ ] Make `src/activity/writer.ts` write idempotently to both stores with stable activity IDs while retaining the legacy reader.
- [ ] Exercise `writeActivity` against both test stores in `src/activity/migration.spec.ts`: retry a failed destination and verify one logical event in each store.
- [ ] Validation
  - [ ] Run public writer contract scenarios; confirm write-failure metrics are visible.
  - [ ] Run relevant lint and format checks.

### Phase 2: Backfill and compare

- [ ] Add resumable, idempotent batches in `src/activity/backfill.ts` without replacing newer dual-written records.
- [ ] Compare record IDs, counts, and ordering per project; report mismatches before any reader switch.
- [ ] Extend `migration.spec.ts` through `backfillActivity` and `listActivity`: interrupt and resume a batch, then verify IDs, ordering, and cursors match without duplicate or lost events.
- [ ] Validation
  - [ ] Run module public-API scenarios and review mismatch reports. Keep fixtures shared and Arrange/Act/Assert visible.
  - [ ] Run relevant lint and format checks.

### Phase 3: Switch reads with rollback

- [ ] Route `listActivity(projectId, cursor)` through a reversible flag in `src/activity/reader.ts` and preserve cursor compatibility.
- [ ] Extend application scenarios in `src/activity/history.spec.ts`: write and read paged history, switch stores, write again, and roll back. Assert the same visible history without lost events; do not assert private helper calls.
- [ ] Keep dual writes and monitor parity through the rollback window.
- [ ] Validation
  - [ ] Run the application cutover/rollback scenarios, then the storage integration scenarios listed above.
  - [ ] Run relevant lint and format checks. This example grants no commit or push permission.
  - [ ] If execution authorizes commits and expects CI, commit the changes and confirm CI is green for that commit.

## References

- EX-27 — sample migration request.
