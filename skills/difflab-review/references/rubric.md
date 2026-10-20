# Review for behavior and comprehension

Read this rubric before generating findings in `review new`. Start with the actual diff, its intent, and enough surrounding code to understand the change. Apply it in local and remote mode, including background reviews. It does not grant additional write permissions.

## Read repository guidance

Read the root and applicable nested `AGENTS.md` files. Follow language conventions, established codebase patterns, and explicit repository rules. Inspect nearby code for naming, module roles, errors, test layout, and shared helpers. Distinguish a real convention from a personal preference.

Record applicable guidance paths in a short `Repository Guidance` section. Identify concrete deviations, or say none were found within the inspected scope. If no guidance exists, say so. If guidance cannot be read, record the limit rather than claiming compliance. Add the section once to old/custom review documents without changing human content or removing existing headings.

## Make comprehensibility a required pass

Inspect each area below. Report only material findings; do not write an essay or invent a finding for every row.

| Area | Inspect | Report when |
| --- | --- | --- |
| Names | Names and code structure against behavior, side effects, callers, and language conventions. | Names or structure hide what happens. Show the mismatch. |
| Module roles | Responsibilities, imports, exports, and established module patterns. | Concerns are mixed or roles are unclear. Name the needed simplification or refactor, including across files. |
| Scope and reuse | New fields, types, wrappers, helpers, dependencies, and unrelated edits against existing concepts and real callers. | A concept duplicates suitable existing state/behavior or adds unjustified complexity. Show the existing alternative or the missing use. |
| Test structure | Semantic groups, names, setup, fixtures, shared helpers, action, and assertions. | A reader cannot readily identify the scenario, operation, or result, or repeated setup obscures them. |
| Repository rules | Applicable guidance against changed files. | A concrete rule is violated. Cite the guidance path and the offending code. |

Comprehension findings do not require a runtime bug. Name the part that is hard to follow and explain its effect. Choose the scope that fixes the problem. If generated code mixes concerns or adds needless layers, request a refactor or simplification now. A multi-file fix is valid when the evidence calls for it. Keep unrelated work out of scope.

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
                 -> needed change or focused question
```

Use simple English. State the problem, its effect, and the needed change, usually in one to three short sentences. Put the file and line in the comment location rather than repeating a long code summary. Add a short snippet only when it clarifies the fix. Do not hand the author a wall of text.

Group repeated instances of one cause. Use the existing severity/status format. A readability problem is not automatically blocking. A clean review can have no change requests. Avoid nitpicks and minor optimizations, even when a deeper audit is requested. Report a material issue only when evidence supports it.

Omit speculative edge cases, hypothetical scale problems, cosmetic preferences, and requests for unrelated hardening. Normal reviews still catch clear correctness defects, exposed secrets, authorization failures, and material performance regressions. An explicit security or performance focus warrants a deeper audit of the requested area, with grounded evidence rather than invented risks. Mark deeper audits `SKIPPED` with a short reason when not warranted; do not claim an audit or executed check that did not happen.

Keep the existing readability, organization, maintainability, and testing sections concise. Put actionable requests in the required local/remote destination with accurate line mappings and model attribution. Preserve human comments. Review permissions, thread handling, and publication rules remain in their workflows.

## Authored examples

These examples are illustrative, not user-supplied artifacts or observations about the current repository:

- “`loadSettings` also saves defaults. Rename it to show that it writes.”
- “This handler formats paths and writes records. Move that work into the existing store.”
- “`isComplete` duplicates `status`. Derive it from the existing field.”
- “Repeated setup hides this test's action. Use the fixture and separate Arrange, Act, and Assert.”
- “These helper tests do not prove that the report is saved. Add an integration scenario through the public API.”

If a public-API test already covers a private helper, do not request a duplicate test. The plan skill lists exact end-to-end/integration scenarios under `Consequences → Testing`. Review tests with the broader priority above. Do not copy lower-level coverage advice into generated plans.
