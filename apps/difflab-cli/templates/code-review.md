# Review: [change or pull request]

- **Revision:** [commit or diff]
- **Intent:** [stated objective and source]
- **Reviewer:** [name]

## Intent Delivery

[Does the change actually deliver the intended behavior? What is missing or outside scope?]

## Readability

[Can a new reader follow the flow, names, and error paths?]

## Semantic Organization

[Are responsibilities, boundaries, and public APIs arranged by meaning?]

## Maintainability

[Are extensions, configuration, migrations, and failure recovery understandable?]

## Quality and Tests

[Behavior, edge cases, test coverage, and evidence from executed checks.]

## Performance

[Cost, allocations, I/O, scaling, and measured or expected impact.]

## Security

[Inputs, trust boundaries, permissions, secrets, dependencies, and abuse cases.]

## Findings

| Severity                 | Location    | Evidence and impact        | Required change or question |
| ------------------------ | ----------- | -------------------------- | --------------------------- |
| [blocking/consider/note] | [file:line] | [reproducible observation] | [concrete action]           |

## Overall Assessment

[Recommendation and reasons; distinguish findings from preferences.]

## Verification and Limits

- **Checks run:** [command and result.]
- **Not verified:** [environment, path, or behavior not checked.]
