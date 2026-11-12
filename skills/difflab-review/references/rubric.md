# Code review rubric

Scaffold `code-review-rubric` as `rubric.yaml` beside `REVIEW.md`. The YAML defines criteria, scopes, and default severities. Follow [review new](workflows/new.md) for single-agent inspection, rubric completion, and publication.

Invoke [difflab-writing-style](../../difflab-writing-style/SKILL.md) and [difflab-bdd](../../difflab-bdd/SKILL.md). Written `AGENTS.md` rules and named style guides override generic preferences. Flag material defects even when existing code shares them. Keep detailed coverage in `rubric.yaml` and link findings from `REVIEW.md`.

## Intent Delivery

- `intent.objective`: Flag missing or incorrect required behavior. Cite the requirement and mismatch.
- `intent.scope`: Flag unrelated changes outside the stated intent.

## Readability

- `readability.function-names`: Flag names that misrepresent behavior, hide side effects, or break naming rules. Suggest a clearer name.
- `readability.structure`: Flag flows that hide what happens. Suggest a simpler flow or code snippet.

## Semantic Organization

- `organization.roles`: Flag mixed responsibilities or unclear module roles. Name the refactor that clarifies ownership.
- `organization.architecture`: Flag mixed responsibilities, unclear ownership, or broken architecture rules.
- `organization.api-ergonomics`: Flag public types unrelated to the module role or APIs that are hard to discover and use.
- `organization.new-files`: Flag new files that lack a justified module boundary. Name the existing module that owns the behavior.
- `organization.file-structure`: Flag files that break the prescribed section order or declaration layout.

## Maintainability

- `maintainability.concepts`: Flag abstractions, wrappers, or types without a clear caller need.
- `maintainability.complexity`: Flag unjustified growth in decision paths.
- `maintainability.utilities`: Flag duplicated logic or inline work that belongs in a shared utility.
- `maintainability.packages`: Flag custom code that recreates functionality provided by an established package.

## Reliability/Testing

Apply [difflab-bdd](../../difflab-bdd/SKILL.md) to analyze test suites against the component's behavior flowchart (`e2e` > `integration` > `unit`, converging state branches, and human-verifiable outputs). When tests are flat, duplicate downstream assertions across converged states, or hide setup, propose a concrete `[M/A/D/R]` BDD test reorganization (`given`/`when`/`then` or `it` with hoisted fixtures).

- `testing.correctness`: Flag incorrect behavior with its triggering case, location, and wrong result.
- `testing.application`: Flag missing outside-in test coverage (`e2e` > `integration` > `unit`) or missing human-verifiable artifacts (screenshots, replays, file dumps, snapshots, JSON outputs, or debug logs).
- `testing.relevance`: Flag verbose unit tests that pad coverage without proving real contracts, duplicate downstream paths after a converged state, test the structure of static assets or templates, test the test apparatus itself, write regression tests for changes introduced within the same changeset or for alpha projects without users, or only test external dependencies.
- `testing.names`: Flag test names that omit the tested functionality or expected outcome.
- `testing.arrange-act-assert`: Flag flat or interleaved setup, actions, and assertions. Propose a flowchart-aligned BDD tree (`given` -> `when` -> `then`) with clear Arrange, Act, and Assert blocks.
- `testing.fixtures`: Flag repeated setup that should be hoisted to an enclosing `given` scope or shared helper.

## Documentation

Apply [difflab-writing-style](../../difflab-writing-style/SKILL.md) when evaluating documentation and comments.

- `documentation.conciseness`: Flag walls of text or complex language. Suggest terse `/simple-english` wording.
- `documentation.redundancy`: Flag text that repeats code or existing docs without adding context.
- `documentation.visuals`: Flag prose explanations where a Mermaid or Draw.io diagram or `[M/A/D/R]` tree is clearer.

## Performance

- `performance.regressions`: Flag material performance regressions with evidence of cost.

## Security

Optional in normal mode; enable for an explicit security focus or `--adversarial`. Report clear security defects found during other checks too.

- `security.defects`: Flag exposed secrets or broken authorization or trust boundaries.
