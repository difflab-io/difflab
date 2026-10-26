# Code review rubric

Scaffold `code-review-rubric` as `rubric.yaml` beside `REVIEW.md`. The YAML defines issues, scopes, and severity defaults. This guide explains the evidence to record. Follow [review new](workflows/new.md) for worker settings, inspection, results, and publication.

## Intent Delivery

- `intent.objective`: Flag missing or incorrect required behavior. Cite the requirement and the mismatch.
- `intent.scope`: Flag unrelated changes. Explain why the stated intent does not require them.

## Readability

- `readability.function-names`: Flag names that misrepresent behavior or break project conventions. Show the mismatch and suggest a clearer name.
- `readability.structure`: Flag flows that hide what happens. Identify the confusing part and suggest a simpler flow.

## Semantic Organization

- `organization.roles`: Flag mixed responsibilities or unclear module roles. Identify the responsibilities and the refactor that clarifies ownership.
- `organization.architecture`: Flag code that breaks the established architecture. Cite the pattern and the role that owns the behavior.
- `organization.api-ergonomics`: Flag public types unrelated to the module role or APIs that are hard to discover and use. Show the confusing caller experience and suggest a clearer interface.
- `organization.new-files`: Flag files without a justified module boundary. Name the existing module that owns the behavior. One or two functions alone do not justify a finding.
- `organization.file-structure`: Flag file layouts that break project rules. Cite the required section order or declaration placement.

## Maintainability

- `maintainability.concepts`: Flag abstractions without a useful caller or purpose. Identify the unnecessary concept and a simpler alternative.
- `maintainability.complexity`: Flag unjustified growth in decision paths. Compare changed functions before and after the change. Explain why the added decisions are unnecessary.
- `maintainability.utilities`: Flag duplication or inline work that obscures a function. Show existing behavior to reuse or a useful utility to extract. Justify its module placement.
- `maintainability.packages`: Flag custom code that recreates suitable package functionality. Identify the package API and explain why it fits the project.

## Reliability/Testing

- `testing.correctness`: Flag incorrect behavior. Record the triggering case, changed location, and wrong result.
- `testing.application`: Flag required behavior without test evidence. Name the missing scenario and useful test boundary.
- `testing.relevance`: Flag tests that only confirm dependency behavior. Show which repository behavior the assertions fail to establish. Meaningful integration tests can use real dependencies.
- `testing.names`: Flag names that omit the tested function or functionality, or its expected behavior. Suggest a name that includes both, regardless of grouping style.
- `testing.arrange-act-assert`: Flag grouping or interleaved setup, actions, and assertions that hide the scenario. Suggest clear groups or separate Arrange, Act, and Assert blocks.
- `testing.fixtures`: Flag setup that hides behavior or recreates shared helpers. Identify the repetition, existing helper, or placement rule.

## Documentation

- `documentation.conciseness`: Flag walls of text or complex language. Identify what is hard to understand and suggest shorter, simple-English wording.
- `documentation.redundancy`: Flag text that repeats code or existing documentation without useful context. Identify the repetition and what the reader actually needs.
- `documentation.visuals`: Flag long explanations that a diagram would make clearer. Identify the structure, flow, or relationship to show.

## Performance

- `performance.regressions`: Flag material regressions. Cite the changed path and evidence of its cost.

## Security

This section is optional. Run it only when explicitly requested. Report clear security defects found in other sections too.

- `security.defects`: Flag exposed secrets or broken authorization or trust boundaries. Cite the changed location and concrete exposure.
