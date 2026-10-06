# Flow run: {{name}}

- **Status:** in progress
- **Definition:** {{absolute-definition-path}}
- **Definition SHA-256:** {{definition-sha256}}
- **Repository:** {{absolute-repository-root}}
- **Run ID:** {{run-id}}

## Resolved inputs

| Input | Value     |
| ----- | --------- |
| input | {{input}} |

## Selected flags and permissions

{{flags-and-capabilities}}

## Selection provenance

{{omitted-step-ids-and-reasons-only-no-instructions}}

## Steps

- [ ] 1. {{selected-step-id}} — {{resolved-handler}}
  - Requires: {{authorized-capability}}
  - Instructions: {{resolved-instructions}}
  - Receives: {{concrete-input-or-prior-step-handoff}}
  - Expected output: {{declared-output-name}}
  - Result/handoff: pending

## Blocker

None.

## Contract

This is the frozen execution snapshot. Include only selected executable steps; never copy unselected instructions here. Resolve all declared inputs before creating this file. References to earlier step outputs are typed handoff slots, filled only from verified results when those steps complete. Check a step only after success; on failure leave it unchecked, record the blocker and stop. Resume this exact instance at its first unchecked step without rereading the global definition.
