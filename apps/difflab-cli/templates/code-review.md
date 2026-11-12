# Review: [change or pull request]

- **Revision:** [commit or diff]
- **Intent:** [stated objective and source]
- **Reviewer:** [actual model identity]
- **Mode:** [normal/adversarial]

[Apply `/difflab-writing-style` and `/difflab-bdd`. Use short sentences, active voice, and familiar words throughout. Keep section assessments brief and link to findings instead of repeating them. Keep detailed criterion coverage in rubric.yaml. Apply AGENTS.md and named style guides. Informal conventions are context, not requirements. Flag material antipatterns even when existing code shares them.]

## Intent Delivery

[Does the change actually deliver the intended behavior? What is missing or outside scope?]

## Readability

[Do names and code structure show what happens? Compare names with behavior, side effects, and callers. Apply written naming rules. Do not enforce harmless informal patterns. Flag misleading names and flows that are hard to follow.]

## Semantic Organization

[Do modules have clear roles and useful public APIs? Are exported types meaningful for the module role? Are methods and classes easy to discover and use? Identify mixed responsibilities and unclear ownership. Refactor or simplify at the scope needed to make the change understandable, including across files. Keep unrelated work out of scope.]

## Maintainability

[Does the change remain understandable and maintainable under applicable written rules? Existing antipatterns do not justify new ones. Check new fields, types, helpers, and dependencies against existing code and callers. Reuse suitable code and remove needless complexity.]

## Reliability/Testing

[Apply `/difflab-bdd`. Analyze tests against the component's behavior flowchart (converging state branches, `e2e` > `integration` > `unit`, and human-verifiable outputs such as screenshots, replays, file dumps, snapshots, JSON outputs, or debug logs). Propose a concrete `[M/A/D/R]` BDD test tree reorganization (`given` -> `when` -> `then` with hoisted fixtures) when tests are flat, repeat downstream assertions across converged states, or obscure setup. Flag tests that only verify external dependencies rather than the repository's source behavior. Report executed checks and limits honestly.]

## Documentation

[Apply `/difflab-writing-style`. Flag walls of text, complex language, and text that only restates the implementation. Require concise `/simple-english` explanations, domain terminology, and Mermaid/Draw.io diagrams or `[M/A/D/R]` trees when visuals communicate structure or flow better than prose.]

## Performance

[Report material regressions with evidence. Avoid nitpicks and minor optimizations. Deepen the audit for an explicit performance focus. Otherwise mark a deeper audit SKIPPED with a short reason.]

## Security

[Optional in normal mode: select for a security focus or --adversarial. Adversarial mode challenges all applicable dimensions. Otherwise state that it was not selected. Report clear security defects discovered by other dimensions without claiming a security audit. Avoid unrelated hardening requests.]

## Change Requests

State each finding once here, with its issue, effect, and useful fix. Use short, plain-English sentences for the whole report, including generated comments and replies. Include a suggested change when a concrete fix is available. State the issue and its effect directly. Phrase recommendations with “Let's”, “I suggest”, or “I recommend”. Include a short snippet or suggested patch only when it clarifies the fix. Use the scope that fixes the problem, including a refactor when needed. Group repeated instances of one cause. Omit repeated context, nitpicks, minor optimizations, and speculative findings. End each generated request and response with its model attribution quote. Preserve human text unchanged.

### [file:line — request]

- **Status:** [open/in progress/resolved]
- **Request:** [verbatim request or concise generated finding]

> Generated via [actual model name, only for a generated request]

- **Response:** [resolution, evidence, or reason this remains open]

> Generated via [actual model name, only for a generated response]

## Findings

| Severity | Location | Evidence and impact | Required change or question |
| --- | --- | --- | --- |
| [blocking/consider/note] | [file:line] | [short link to Change Request; do not repeat its text] | [short action or link] |

## Overall Assessment

[Recommendation and reasons; distinguish material findings from preferences. A clean review may have no change requests. Keep section assessments concise.]

## Verification and Limits

- **Checks run:** [command and result.]
- **Not verified:** [environment, path, behavior, or applicable repository guidance that could not be checked.]
- **Rubric:** [path to the copied YAML rubric with completed criterion results. Disclose missing, pending, skipped, or stale results.]
