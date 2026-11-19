# [Outcome to deliver]

- **Status:** draft
- **Branch:** [branch]
- **Issue:** [issue or none]

## Intent

[State who needs this change, what becomes possible afterward, and why it matters now.]

## Requirements

[List observable behavioral capabilities and performance, security, cost, isolation, and reliability characteristics from a client, caller, or end-user perspective. Use plain bullets without `FR` or `NFR` prefixes. Put internal types, function names, CLI flags, configuration internals, file layouts, and code-style rules in Design and Phases.]

- [Observable client or end-user behavior and how to make sure that it works.]
- [Observable performance, security, cost, isolation, or reliability characteristic.]
- [Explicit boundaries and non-goals.]

## Design

### Big Ideas

[Lead with compact Mermaid diagrams or fenced trees. Drop prose when a diagram shows the structure or flow. Show component relationships with a component diagram, processes with a flowchart, and file artifacts with a tree. Keep decisions, responsibilities, invariants, and failure behavior beside the visual. Draw only affected parts, and include enough detail to execute without the original chat.]

### Infrastructure Changes

[List hosting, service, deployment, network, or managed-resource changes. Put new source modules in Repo Changes. If no infrastructure changes, write N/A.]

### Interfaces

[Show changed public interactions, contracts, and failure results with compact commands, signatures, code, or pseudocode. Keep implementation steps in Phases.]

### Consequences

#### Repo Changes

[Draw a directory-grouped file tree with `[M]` modified, `[A]` added, `[D]` deleted, and `[R]` renamed markers. Apply `/difflab-writing-style`. Use real paths for existing files, label new files, and note the largest edits. If no files are removed, state that explicitly.]

#### Testing

[Apply `/difflab-bdd`. Draw a Mermaid behavior flowchart from the user or caller perspective with context branches, state transitions, and converging states. Map the flowchart to a nested `[M/A/D/R]` BDD test tree starting at `given <context>` with `when` and `then` clauses. Collapse single-outcome branches to `when <action>, then <outcome>`, and hoist shared fixtures. Prioritize `e2e` over `integration` over `unit`, and name human-verifiable outputs such as screenshots, snapshots, JSON payloads, or logs. If a skill change has no test harness, label its validation steps `manual acceptance`.]

#### Trade-offs

[State risks, compatibility limits, and deferred work.]

## Phases

[List ordered tasks with file or module targets. Keep design decisions in Design. Name application behavior for end-to-end tests and public module behavior for integration tests. Use separate Arrange, Act, and Assert steps. Follow the execution workflow permissions for commits and pushes.]

### Phase 1: [Outcome]

- [ ] [Task A]
- [ ] [Task B]
- [ ] [Task C]
- [ ] [Task D]
- [ ] Validation
  - [ ] [Make sure that the observable application or module contract passes its test.]
  - [ ] [Run format, lint, and build tasks.]
  - [ ] [If execution authorizes commits and expects CI, commit changes and make sure that CI passes.]

### Phase 2: [Outcome]

- [ ] [Task A]
- [ ] [Task B]
- [ ] [Task C]
- [ ] [Task D]
- [ ] Validation
  - [ ] [Make sure that the observable application or module contract passes its test.]
  - [ ] [Run format, lint, and build tasks.]
  - [ ] [If execution authorizes commits and expects CI, commit changes and make sure that CI passes.]

### Phase 3: [Outcome]

- [ ] [Task A]
- [ ] [Task B]
- [ ] [Task C]
- [ ] [Task D]
- [ ] Validation
  - [ ] [Make sure that the observable application or module contract passes its test.]
  - [ ] [Run format, lint, and build tasks.]
  - [ ] [If execution authorizes commits and expects CI, commit changes and make sure that CI passes.]

## References

- [Source issue or architecture decision.]
- [Supporting external specification or documentation.]
- [Related repository path or prior plan.]
