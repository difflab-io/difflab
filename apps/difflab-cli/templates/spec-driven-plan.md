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

[Start with a directory-grouped file tree using `[M]` modified, `[A]` added, `[D]` deleted, and `[R]` renamed before changed entries, including tests. Apply `/difflab-writing-style`. Identify the largest edits in a short note. Use real inspected paths and label proposed files. State when nothing is removed.]

#### Testing

[Apply `/difflab-bdd`. First draw a Mermaid behavior flowchart showing context branches, state transitions, and converging intermediate states from the user's or caller's perspective. Then map the flowchart into a nested `[M/A/D/R]` BDD test tree starting with `given <context>` (or optional `describe`/`feature`), nesting `when` -> `then` as needed, collapsing single-outcome branches to `when <action>, then <outcome>`, and hoisting shared fixtures. Prioritize `e2e` > `integration` > `unit` and specify human-verifiable outputs (screenshots, replays, file dumps, snapshots, JSON outputs, or debug logs). Label skill checks without a harness as `manual acceptance`.]

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
