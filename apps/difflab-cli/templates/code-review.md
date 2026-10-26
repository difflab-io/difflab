# Review: [change or pull request]

- **Revision:** [commit or diff]
- **Intent:** [stated objective and source]
- **Reviewer:** [name]

[Apply root and applicable nested AGENTS.md rules throughout every section. Repository rules take precedence over generic rubric conventions. Cite violations under the relevant section.]

## Intent Delivery

[Does the change actually deliver the intended behavior? What is missing or outside scope?]

## Readability

[Do names and code structure show what happens? Compare names with behavior, side effects, and callers. Follow language conventions and established codebase patterns. Flag misleading names and flows that are hard to follow.]

## Semantic Organization

[Do modules have clear roles and useful public APIs? Are exported types meaningful for the module role? Are methods and classes easy to discover and use? Identify mixed responsibilities and unclear ownership. Refactor or simplify at the scope needed to make the change understandable, including across files. Keep unrelated work out of scope.]

## Maintainability

[Does the change follow established codebase patterns and applicable AGENTS.md rules? Check new fields, types, helpers, and dependencies against existing code and callers. Reuse suitable code and remove needless complexity.]

## Reliability/Testing

[Prioritize end-to-end application behavior, then module behavior through public APIs, then focused unit behavior with public APIs first. Flag tests that only verify external dependencies rather than the repository's source behavior or integration contract. Require test names to identify the function or functionality tested and its expected behavior, regardless of grouping style. Name missing observable contracts or regressions; do not demand coverage of every function or a percentage. Check semantic grouping, clear Arrange/Act/Assert blocks, fixtures, and existing shared helpers. Flag walls of repeated setup or interleaved actions/assertions that hide the behavior. Report executed checks and limits honestly.]

## Documentation

[Flag walls of text, complex language, and text that only restates the implementation. Require concise, simple-English explanations. Prefer diagrams when they clarify structures, flows, or relationships better than long prose.]

## Performance

[Report material regressions with evidence. Avoid nitpicks and minor optimizations. Deepen the audit for an explicit performance focus. Otherwise mark a deeper audit SKIPPED with a short reason.]

## Security

[Optional: run this dimension only when explicitly requested, including a security focus. Otherwise state that it was not selected. Report clear security defects discovered by other dimensions without claiming a security audit. Avoid unrelated hardening requests.]

## Change Requests

Every generated comment and reply must use simple English and be as short as possible. Include a suggested change when a concrete fix is available. State the issue and its effect directly. Phrase recommendations with “Let's”, “I suggest”, or “I recommend”. Include a short snippet or suggested patch only when it clarifies the fix. Use the scope that fixes the problem, including a refactor when needed. Group repeated instances of one cause. Omit repeated context, nitpicks, minor optimizations, and speculative findings. End each generated request and response with its model attribution quote. Preserve human text unchanged.

### [file:line — request]

- **Status:** [open/in progress/resolved]
- **Request:** [verbatim request or concise generated finding]

> Generated via [actual model name, only for a generated request]

- **Response:** [resolution, evidence, or reason this remains open]

> Generated via [actual model name, only for a generated response]

## Findings

| Severity | Location | Evidence and impact | Required change or question |
| --- | --- | --- | --- |
| [blocking/consider/note] | [file:line] | [reproducible observation] | [concrete action] |

## Overall Assessment

[Recommendation and reasons; distinguish material findings from preferences. A clean review may have no change requests. Keep section assessments concise.]

## Verification and Limits

- **Checks run:** [command and result.]
- **Not verified:** [environment, path, behavior, or applicable repository guidance that could not be checked.]
- **Rubric:** [path to the copied YAML rubric with completed criterion results. Disclose missing, pending, skipped, or stale results.]
