# [Outcome to deliver]

- **Status:** draft
- **Branch:** [branch]
- **Issue:** [issue or none]

## Intent

[Who needs this change, what should be possible afterward, and why now?]

## Requirements

- [Observable outcome and how to tell whether it works.]
- [Limits and explicit non-goals.]

## Design

### Big Ideas

[Lead with compact diagrams. Minimize prose and do not repeat the visual. Use short sentences and familiar words. Show changed component relationships with a component diagram, new processes with flowcharts, and new file-based artifacts with trees or suitable visuals. Use Mermaid and fenced text where useful. Keep decisions, responsibilities, invariants, and important failure behavior beside the relevant visual. Draw only the affected parts; keep enough detail to execute without the original chat.]

### Infrastructure Changes

[Actual hosting, services, deployment, networking, or managed-resource changes. New source modules belong in Repo Changes. Write N/A. if no infrastructure changes.]

### Interfaces

[Use compact commands, signatures, code, or pseudocode to show changed public interactions and contracts, including important failure results. Keep implementation actions in the phases.]

### Consequences

#### Repo Changes

[Start with a selected file tree: [M] modified, [A] added, [D] deleted before changed filenames, including tests. Identify the largest edits in a short note. Include new modules and meaningful structural changes. Use real inspected paths; label proposed files. State when nothing is removed.]

#### Testing

[Inspect the actual test setup first. Show a nested outline of behavior checks mapped to existing suites and configured tasks. Label skill checks without a harness as manual acceptance. Do not invent an end-to-end suite or runner. Name the entry point, input/action, and expected result for each scenario. Reuse existing fixtures and suites. Match the scenarios to requirements and phase checks.]

#### Trade-offs

[Risks, compatibility, and what is deferred.]

## Phases

[Ordered tasks with file/module targets and enough detail to act. Keep decisions and contracts in the design. Specify the exact application behavior for end-to-end tests and the public module behavior for integration tests. Require clear Arrange/Act/Assert blocks. Use relevant checks and existing helpers. Keep conditional commit and CI gates when expected, including for plan go --commit. Follow the execution workflow's commit/push permissions.]

### Phase 1: [Outcome]

- [ ] [Task A]
- [ ] [Task B]
- [ ] [Task C]
- [ ] [Task D]
- [ ] Validation
  - [ ] [Observable application/module contract and the existing or proposed check.]
  - [ ] [Relevant format, lint, or build checks.]
  - [ ] [Commit and confirm CI is green, if expected and authorized.]

### Phase 2: [Outcome]

- [ ] [Task A]
- [ ] [Task B]
- [ ] [Task C]
- [ ] [Task D]
- [ ] Validation
  - [ ] [Observable application/module contract and the existing or proposed check.]
  - [ ] [Relevant format, lint, or build checks.]
  - [ ] [Commit and confirm CI is green, if expected and authorized.]

### Phase 3: [Outcome]

- [ ] [Task A]
- [ ] [Task B]
- [ ] [Task C]
- [ ] [Task D]
- [ ] Validation
  - [ ] [Observable application/module contract and the existing or proposed check.]
  - [ ] [Relevant format, lint, or build checks.]
  - [ ] [Commit and confirm CI is green, if expected and authorized.]

## References

- [Source or related decision.]
- [External references, docs supporting the implementation plan.]
