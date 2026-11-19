# Code review rubric

Scaffold `code-review-rubric` as `rubric.yaml` beside `REVIEW.md`. The YAML template defines review criteria, scopes, and default severities. Follow [review new](workflows/new.md) for single-agent inspection, rubric completion, and publication.

Invoke [difflab-writing-style](../../difflab-writing-style/SKILL.md) and [difflab-bdd](../../difflab-bdd/SKILL.md). Written `AGENTS.md` rules and named style guides override generic preferences. Flag material defects even when existing code shares them, keep detailed results in `rubric.yaml`, and link findings from `REVIEW.md`.

## Intent Delivery

Compare the diff against the stated objective, requirements, and scope boundaries.

- `intent.objective`: Flag missing or wrong required behavior, and cite the requirement and mismatch.
- `intent.scope`: Flag unrelated changes outside the stated intent.
- Intent criteria apply once across the whole review (`scope: review`).

## Readability

Inspect symbol names and control flow in every changed source file.

- `readability.function-names`: Flag names that misrepresent behavior, hide side effects, or break naming rules, and suggest a clearer name.
- `readability.structure`: Flag control flow that hides what happens, and suggest a simpler flow or snippet.
- Readability criteria require a result for every changed source file.

## Semantic Organization

Evaluate module boundaries, public contracts, and declaration order.

- `organization.roles`: Flag mixed responsibilities or unclear module roles, and name the refactor that clarifies ownership.
- `organization.architecture`: Flag mixed responsibilities, unclear ownership, or broken architecture rules across files.
- `organization.api-ergonomics`: Flag public types unrelated to the module role or APIs that remain hard to discover and use.
- `organization.new-files`: Flag new files without a clear module boundary, and name the existing module that owns the behavior.
- `organization.file-structure`: Flag files that break the prescribed section order or declaration layout.

## Maintainability

Evaluate added concepts, branch growth, shared helpers, and package reuse.

- `maintainability.concepts`: Flag abstractions, wrappers, or types without a clear caller need.
- `maintainability.complexity`: Flag branch growth beyond what the required behavior needs.
- `maintainability.utilities`: Flag duplicated logic or inline work that belongs in a shared utility.
- `maintainability.packages`: Flag custom code that recreates functionality from an established package.

## Reliability/Testing

Apply [difflab-bdd](../../difflab-bdd/SKILL.md) to evaluate tests against the behavior flowchart (`e2e` over `integration` over `unit` and human-verifiable outputs). If tests are flat, duplicate converged assertions, or hide setup, propose a `[M/A/D/R]` BDD test tree (`given`, `when`, `then`).

- `testing.correctness`: Flag wrong behavior with its triggering input, location, and wrong output.
- `testing.application`: Flag missing outside-in test coverage or missing human-verifiable artifacts (screenshots, replays, snapshots, JSON payloads, or logs).
- `testing.relevance`: Flag unit tests that pad coverage without proving contracts, duplicate converged branches, or test only external dependencies. Flag tests that inspect static asset or template structure, test the harness, or add same-changeset or alpha regression tests.
- `testing.names`: Flag test names that omit the tested functionality or expected outcome.
- `testing.arrange-act-assert`: Flag flat or mixed setup, actions, and assertions. Propose a BDD tree with separate Arrange, Act, and Assert blocks.
- `testing.fixtures`: Flag repeated setup that belongs in an enclosing `given` scope or shared helper.

## Documentation

Apply [difflab-writing-style](../../difflab-writing-style/SKILL.md) when evaluating documentation, plans, architecture designs, PRDs, intent files, and comments.

- `documentation.conciseness`: Flag walls of text or complex prose, and suggest terse `/simple-english` wording.
- `documentation.redundancy`: Flag prose that repeats code or existing documentation without adding context.
- `documentation.visuals`: Flag prose explanations where a Mermaid or Draw.io diagram or `[M/A/D/R]` tree shows structure or flow more clearly.
- `documentation.requirements`: Flag `FR` or `NFR` prefixes and internal implementation specifications inside `Requirement` and `Requirements` sections. Require observable behavior and performance, security, cost, isolation, and reliability characteristics from a client or end-user perspective. Route internal types, function names, CLI flags, configuration internals, file layouts, and code-style rules to `Design` or `Implementation`.

## Performance

Inspect the diff for material runtime, memory, query, or I/O regressions. Deepen the audit when the user requests a performance focus. Otherwise record `SKIPPED` when measurements did not run.

- `performance.regressions`: Flag material performance regressions with concrete cost evidence.

## Security

Security is optional in normal mode and enabled for a security focus or `--adversarial`. Report clear security defects found in other sections too. Do not claim a full security audit when the section stays unselected.

- `security.defects`: Flag exposed secrets or broken authorization or trust boundaries.
