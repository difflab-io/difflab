# Review: [change or pull request]

- **Revision:** [commit or diff]
- **Intent:** [stated objective and source]
- **Reviewer:** [name]

## Intent Delivery

[Does the change actually deliver the intended behavior? What is missing or outside scope?]

## Readability

[Can a new reader follow the flow, names, and error paths? Is code readable for and understandable for an average mide-level developer at a glance?]

## Semantic Organization

[Are responsibilities, boundaries, and public APIs arranged by meaning? Are modules semantically meaningful? Is code in applications and libraries well sliced by concerns?]

## Maintainability

[Is the code DRY? Is the code over-engineered beyond required scope? Are well trusted / industry-standard libraries and frameworks used for standard tasks? Are domain specific conventions approprate for the codebase being followed? Is basic linting, formatting and static analysis hygiene present?]

## Reliability/Testing

[Behavior, edge cases, test coverage, and evidence from executed checks. Adhere to repo testing standards if specified in AGENTS.md or docs. Otherwise, generally prioritize e2e coverage and test readability and organization.]

## Performance

[Cost, allocations, I/O, scaling, and measured or expected impact. State SKIPPED with reasons for non-perf bugfixes, minor refactors, and non-performance critical applications.]

## Security

[Evaluate authentication and autorization, permissions, secrets, dependencies, input validation, proper error handling, and trust boundaries. State SKIPPED if skipped with reason, for example for chores, simple scripting, pure cosmetic UI work, documentation, etc.]

## Findings

| Severity                 | Location    | Evidence and impact        | Required change or question |
| ------------------------ | ----------- | -------------------------- | --------------------------- |
| [blocking/consider/note] | [file:line] | [reproducible observation] | [concrete action]           |

## Overall Assessment

[Recommendation and reasons; distinguish findings from preferences.]

## Verification and Limits

- **Checks run:** [command and result.]
- **Not verified:** [environment, path, or behavior not checked.]
