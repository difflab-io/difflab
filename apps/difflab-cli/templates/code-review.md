# Review: [change or pull request]

- **Revision:** [commit or diff]
- **Intent:** [stated objective and source]
- **Reviewer:** [name]

## Intent Delivery

[Does the change actually deliver the intended behavior? What is missing or outside scope?]

## Readability

[Compare function, variable, and type names with actual behavior, side effects, results, and callers. Can a mid-level developer identify the main flow and error paths? Report concrete mismatches and reader burden, not personal naming preferences.]

## Semantic Organization

[Do modules have clear roles, coherent responsibilities, and thin public APIs? Identify mixed concerns, unclear ownership, or dependencies that expose unnecessary internals. Name a small useful boundary change rather than proposing an unrelated refactor.]

## Maintainability

[Check added fields, types, wrappers, helpers, dependencies, and unrelated edits against existing concepts and callers. Are additions justified, or could suitable existing state/APIs/helpers be reused? Identify concrete duplication or complexity; do not add abstraction for its own sake.]

## Reliability/Testing

[Prioritize end-to-end application behavior, then module behavior through public APIs, then focused unit behavior with public APIs first. Name missing observable contracts or regressions; do not demand coverage of every function or a percentage. Check semantic grouping, clear Arrange/Act/Assert blocks, fixtures, and existing shared helpers. Flag walls of repeated setup or interleaved actions/assertions that hide the behavior. Report executed checks and limits honestly.]

## Repository Guidance

[List root/applicable nested AGENTS.md paths and material deviations in changed files. Cite actual rules, including code/test organization and helper placement where prescribed. If none applies or guidance could not be read, say so. Keep this assessment brief.]

## Performance

[Report concrete material regressions. Deepen the audit when performance is an explicit focus; omit speculative scale/allocation concerns. Otherwise state SKIPPED with a short reason when a deeper audit is not warranted.]

## Security

[Report clear security defects, including exposed secrets or broken authorization/trust boundaries. Deepen the audit for an explicit security focus; avoid unrelated hardening requests. State SKIPPED with a short reason when a deeper audit is not warranted.]

## Change Requests

Track grounded actionable requests: location, evidence, comprehension/rule/behavior impact, and a small remedy. Consolidate repeated instances of the same cause. Omit speculative edge cases and cosmetic preferences; do not invent findings to fill sections. End each generated request and response with its own model attribution quote; preserve human text unchanged.

### [file:line — request]

- **Status:** [open/in progress/resolved]
- **Request:** [verbatim request or concise generated finding]

> Generated via [actual model name, only for a generated request]

- **Response:** [resolution, evidence, or reason this remains open]

> Generated via [actual model name, only for a generated response]

## Findings

| Severity                 | Location    | Evidence and impact        | Required change or question |
| ------------------------ | ----------- | -------------------------- | --------------------------- |
| [blocking/consider/note] | [file:line] | [reproducible observation] | [concrete action]           |

## Overall Assessment

[Recommendation and reasons; distinguish material findings from preferences. A clean review may have no change requests. Keep section assessments concise.]

## Verification and Limits

- **Checks run:** [command and result.]
- **Not verified:** [environment, path, or behavior not checked.]
