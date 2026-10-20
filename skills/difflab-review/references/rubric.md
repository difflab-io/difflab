# Review for behavior and comprehension

Read this rubric before generating findings in `review new`. Start with the actual diff, its intent, and enough surrounding code to understand the change. Apply it in local and remote mode, including background reviews. It does not grant additional write permissions.

## Read repository guidance

Read the root and applicable nested `AGENTS.md` files. Check the changed code against their actual rules: naming, file sections, module boundaries, exceptions, test placement, helper scope, and persistence location where prescribed. Inspect referenced conventions when relevant. Do not substitute generic style preferences.

Record applicable guidance paths in a short `Repository Guidance` section. Identify concrete deviations, or say none were found within the inspected scope. If no guidance exists, say so. If guidance cannot be read, record the limit rather than claiming compliance. Add the section once to old/custom review documents without changing human content or removing existing headings.

## Make comprehensibility a required pass

Inspect each area below. Report only material findings; do not write an essay or invent a finding for every row.

| Area             | Inspect                                                                                                             | Report when                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Names            | Function, variable, and type names against actual behavior, side effects, results, and callers.                     | A name misstates or hides what the code does. Show the mismatch.                                                                                     |
| Module roles     | Responsibilities, imports, dependency direction, exports, and existing module boundaries.                           | Unrelated concerns are mixed, a role is unclear, or callers must know unnecessary internals. Name the concerns and a small sensible boundary change. |
| Scope and reuse  | New fields, types, wrappers, helpers, dependencies, and unrelated edits against existing concepts and real callers. | A concept duplicates suitable existing state/behavior or adds unjustified complexity. Show the existing alternative or the missing use.              |
| Test structure   | Semantic groups, names, setup, fixtures, shared helpers, action, and assertions.                                    | A reader cannot readily identify the scenario, operation, or result, or repeated setup obscures them.                                                |
| Repository rules | Applicable guidance against changed files.                                                                          | A concrete rule is violated. Cite the guidance path and the offending code.                                                                          |

Comprehension findings do not require a runtime bug. A misleading name, mixed responsibility, redundant field, or unreadable test can warrant a change. Explain the specific reader burden; do not treat personal taste as a defect. Avoid broad refactors when a rename, reuse, or local boundary fix will do.

## Review tests from the outside in

Prioritize evidence in this order:

1. End-to-end application behavior: does a real user/CLI/API scenario produce its expected visible result?
2. Module behavior through public APIs: do meaningful collaborators uphold the module's contract?
3. Focused unit behavior, again prioritizing public APIs: what distinct logic still needs local evidence?

Assess outcomes, saved state, visible effects, and meaningful failure behavior. High line/function coverage is not a substitute for application or module contracts. A missing-test request must name the unverified behavior or regression and the useful boundary to exercise.

Do not demand a test for each function, coverage percentages, exported private helpers, private call sequences, or duplicate unit cases for behavior already established through public APIs. Test an internal algorithm directly only when its distinct behavioral risk cannot reasonably be isolated publicly. Avoid mocks that replace the collaboration or result being tested. The priority order does not require adding three test layers to every change.

Tests must be readable code:

- Group related scenarios with the repository's normal constructs, such as `describe`, rather than a flat list of unrelated cases. Avoid forced nesting.
- Separate Arrange, Act, and Assert into visible blocks. Use `// Arrange`, `// Act`, and `// Assert` in multi-step tests, or the language's equivalent. Labels alone do not fix interleaved setup and assertions.
- Use concise behavior names. Keep the action and expected result visible; extract repetitive setup into suitable fixtures.
- Inspect existing shared test helpers before accepting newly recreated generic utilities. Follow repository rules for shared versus single-file helpers. Do not introduce a fixture framework or hide the behavior just to remove a few repeated lines.

For example, many tests of `isExpired` do not establish that accepting an expired invitation leaves membership unchanged. That scenario belongs at the application or module public API. An untested private date helper is not itself a finding.

## Keep findings useful

Before emitting a finding, establish:

```text
changed location -> concrete evidence -> comprehension / rule / behavior impact
                 -> smallest useful remedy or focused question
```

Consolidate repeated instances with the same cause. Use the existing severity/status format; a readability problem is not automatically blocking. Distinguish a preference from a required change. A clean review may have no change requests. Avoid optional-nit lists that ask the author to do work without an identified benefit.

Omit speculative edge cases, hypothetical scale problems, cosmetic preferences, and requests for unrelated hardening. Normal reviews still catch clear correctness defects, exposed secrets, authorization failures, and material performance regressions. An explicit security or performance focus warrants a deeper audit of the requested area, with grounded evidence rather than invented risks. Mark deeper audits `SKIPPED` with a short reason when not warranted; do not claim an audit or executed check that did not happen.

Keep the existing readability, organization, maintainability, and testing sections concise. Put actionable requests in the required local/remote destination with accurate line mappings and model attribution. Preserve human comments. Review permissions, thread handling, and publication rules remain in their workflows.

## Authored examples

These examples are illustrative, not user-supplied artifacts or observations about the current repository:

- `loadSettings` writes missing defaults: point to the write and explain why a query-like name misleads callers. Request a name that describes the effect or reuse an existing read-only API.
- An HTTP handler allocates storage paths and serializes records despite an existing store API: cite the mixed transport/persistence roles and reuse the store rather than designing a new framework.
- A request adds `isComplete` beside an existing equivalent status field: show the duplication and ask to derive/reuse the existing state unless a caller needs a distinct meaning.
- A test has fifty lines of repeated setup with actions mixed into assertions: identify the hidden scenario and request a fixture plus distinct Arrange/Act/Assert blocks.
- A suite covers every helper but never verifies saved output through the module's public API: request the missing output contract, not still more helper tests.
- A clean public-API test already exercises a private helper: emit no request for separate helper coverage. Omit speculative clock skew or hypothetical allocation concerns unless the diff or requested focus provides concrete evidence.
