# Code review rubric

The installed `code-review-rubric` YAML template defines the criteria used for a review. Scaffold it as `rubric.yaml` beside `REVIEW.md`. This guide explains the evidence for each default criterion. Follow [review new](workflows/new.md) for inspection, file and function tags, severity, and result instructions. If an installed template is customized, assess its criteria too.

## Intent Delivery

- `intent.objective` (blocking, review): Flag when the change contradicts its stated intent or omits required behavior. Evidence: Identify the stated requirement and the contradictory or missing behavior.
- `intent.scope` (consider, review): Flag when the change includes work outside its stated scope. Evidence: Identify the unrelated change and explain why the stated intent does not require it.

## Readability

- `readability.function-names` (consider, file): Flag when function or other names misrepresent behavior, hide side effects, or break established naming conventions. Evidence: Show the mismatch with actual behavior or the project convention. Suggest a name that reflects what the code does.
- `readability.structure` (consider, file): Flag when the changed flow is materially hard to follow. Evidence: Identify the confusing flow and the simplification that makes its behavior clear.

## Semantic Organization

- `organization.roles` (consider, file): Flag when a module mixes responsibilities or its imports, exports, or public API obscure its role. Evidence: Identify the mixed or unclear responsibilities and the simplification or refactor that clarifies ownership.
- `organization.architecture` (consider, review): Flag when files or classes break the established architecture or module patterns. Evidence: Cite the project pattern and identify the architectural role that owns the misplaced behavior.
- `organization.new-files` (consider, applicable-file): Flag when a new file lacks a justified module boundary or contains functions that belong in an existing module. Evidence: Identify the responsibility that warrants a separate file, or name the existing module that owns it. Inspect files with only one or two functions. Function count alone is not a defect. Applies to: Added source files that introduce a module or submodule. A rename alone does not qualify.
- `organization.file-structure` (consider, file): Flag when a file breaks the project-prescribed structure or declaration order. Evidence: Cite the required section order, declaration groups, or public/private placement and the offending code.

## Maintainability

- `maintainability.concepts` (consider, review): Flag when new fields, types, wrappers, helpers, dependencies, or layers lack a justified use and add needless complexity. Evidence: Identify the missing use or unnecessary abstraction and the simpler implementation or existing concept.
- `maintainability.complexity` (consider, applicable-file): Flag when cyclomatic complexity grows without justification from the required behavior. Evidence: Compare changed functions before and after the PR. Identify added decision points and question whether they are necessary. Applies to: Files with added or changed executable functions. For new functions, assess whether the introduced decision paths are justified.
- `maintainability.utilities` (consider, review): Flag when duplicated state or behavior, or inline work, makes a function harder to read or maintain. Evidence: Show suitable existing state or behavior to reuse, or the self-contained utility to extract. Explain how extraction improves readability or reuse and justify its module placement.
- `maintainability.packages` (consider, review): Flag when custom code recreates functionality that an established, widely used package suitably provides. Evidence: Identify a suitable package API and the custom behavior it replaces. Explain why it fits the project and its dependencies.

## Reliability/Testing

- `testing.correctness` (blocking, file): Flag when the changed code produces incorrect behavior. Evidence: Show the changed location, triggering scenario, and incorrect observable result.
- `testing.application` (consider, review): Flag when required behavior or a meaningful regression lacks test evidence. Evidence: Name the unverified behavior and useful test boundary. Prioritize real user, CLI, or API scenarios, then module public APIs, then distinct remaining unit behavior.
- `testing.arrange-act-assert` (consider, applicable-file): Flag when test grouping, names, or interleaved setup, actions, and assertions hide the scenario or expected result. Evidence: Identify the obscured scenario, action, or result. Suggest semantic grouping, concise behavior names, or separate Arrange, Act, and Assert blocks. Applies to: Added or modified test files.
- `testing.fixtures` (consider, applicable-file): Flag when repeated setup, unsuitable fixtures, or recreated shared utilities obscure tests or duplicate existing helpers. Evidence: Identify the repetition or hidden behavior, existing shared helper, or helper-placement rule. Suggest suitable fixtures or reuse. Applies to: Added or modified tests, fixtures, test setup, or test utility files.

## Performance

- `performance.regressions` (consider, review): Flag when the change causes a material performance regression. Evidence: Show the changed path and concrete evidence of its performance impact.

## Security

This dimension is optional and runs only when explicitly requested. Other dimensions still report clear security defects that they discover.

- `security.defects` (blocking, review): Flag when the change exposes secrets or breaks authorization or a trust boundary. Evidence: Show the changed location and concrete evidence of the exposure or broken boundary.
