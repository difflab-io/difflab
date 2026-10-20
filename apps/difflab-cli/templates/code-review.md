# Review: [change or pull request]

- **Revision:** [commit or diff]
- **Intent:** [stated objective and source]
- **Reviewer:** [name]

## Intent Delivery

[Does the change actually deliver the intended behavior? What is missing or outside scope?]

## Readability

[Do names and code structure show what happens? Compare names with behavior, side effects, and callers. Follow language conventions and established codebase patterns. Flag misleading names and flows that are hard to follow.]

## Semantic Organization

[Do modules have clear roles and useful public APIs? Identify mixed responsibilities and unclear ownership. Refactor or simplify at the scope needed to make the change understandable, including across files. Keep unrelated work out of scope.]

## Maintainability

[Does the change follow established codebase patterns and applicable AGENTS.md rules? Check new fields, types, helpers, and dependencies against existing code and callers. Reuse suitable code and remove needless complexity.]

## Reliability/Testing

[Prioritize end-to-end application behavior, then module behavior through public APIs, then focused unit behavior with public APIs first. Name missing observable contracts or regressions; do not demand coverage of every function or a percentage. Check semantic grouping, clear Arrange/Act/Assert blocks, fixtures, and existing shared helpers. Flag walls of repeated setup or interleaved actions/assertions that hide the behavior. Report executed checks and limits honestly.]

## Repository Guidance

[List root/applicable nested AGENTS.md paths and material deviations in changed files. Cite actual rules, including code/test organization and helper placement where prescribed. If none applies or guidance could not be read, say so. Keep this assessment brief.]

## Performance

[Report material regressions with evidence. Avoid nitpicks and minor optimizations. Deepen the audit for an explicit performance focus. Otherwise mark a deeper audit SKIPPED with a short reason.]

## Security

[Report clear security defects, including exposed secrets or broken authorization/trust boundaries. Deepen the audit for an explicit security focus; avoid unrelated hardening requests. State SKIPPED with a short reason when a deeper audit is not warranted.]

## Change Requests

Use short comments in simple English. State the problem and its effect directly. Phrase recommendations as suggestions with “Let's”, “I suggest”, or “I recommend”, usually in one to three sentences total. Use the scope that fixes the problem, including a refactor when needed. Group repeated instances of one cause. Omit nitpicks, minor optimizations, and speculative findings. End each generated request and response with its model attribution quote. Preserve human text unchanged.

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
- **Not verified:** [environment, path, or behavior not checked.]
