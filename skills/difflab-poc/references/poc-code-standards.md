# PoC code standards

Read this before creating or implementing a PoC. These requirements also form the completion checklist for `new` and `freeze`.

## Choose the experiment

State the question, the smallest useful success criterion, and what is outside the experiment.

- From scratch: build a minimal runnable prototype. Remove existing application code only when requested and after confirming the deletion scope.
- Design or first implementation: exercise the proposed design with one small representative example before expanding it.
- Alternatives: give each approach a focused module or directory, a named run task, and comparable input. Explain meaningful differences and observations rather than building a universal comparison framework.

## Keep the code easy to understand

Use direct code, few dependencies, and only abstractions needed by the experiment. Avoid speculative frameworks, generic factories, layers, and production infrastructure that do not answer the question.

Break code into focused submodules with small, controlled public APIs. Each module should have one clear responsibility; keep its internal helpers private. Separate entrypoints, experiment logic, and fixtures when that makes the flow easier to follow. Split files when mixed responsibilities or size make them hard to read; a multi-thousand-line implementation file is not an acceptable PoC deliverable. Do not meet this rule by splitting a monolith into arbitrary fragments.

Use the smallest examples and fixtures that demonstrate the behavior. Keep necessary alternative-specific code local; avoid duplication that obscures comparisons. Comments should explain an experimental choice or limitation, not repeat the code. Do not pad the prototype with generated filler, unused options, or unrelated refactors.

## Use established tools for supporting code

Write custom code for the behavior being prototyped or compared. For supporting work, use standard tools, runtime APIs, and established libraries instead of rebuilding common functionality. Prefer tools and libraries already available in the repository; add a focused dependency when it reduces total code and makes the experiment easier to understand. Keeping dependencies few does not justify a larger homemade implementation.

For example, if manual argument parsing would exceed 10 lines, use a standard argument parser. Use established utility libraries when they meaningfully shorten common collection, path, filesystem, or formatting operations without hiding the experiment's flow. Avoid custom parsers, test harnesses, or utility frameworks unless that behavior is itself the subject of the experiment.

## Make the branch runnable

Replace the root `README.md` with the filled `poc-readme` template on every new PoC branch. Preserve the full original `base_commit` on reuse. The README must explain setup, the question, each approach, the module layout, commands, results, limitations, and the follow-up decision.

Provide discoverable mise tasks for build, tests, and running each prototype. Use the repository's task conventions when present; otherwise use `build`, `test`, and `run:<approach>` in `mise.toml`. Tasks must execute the real commands with the required working directory. Document tool versions, dependencies, environment inputs, and any services needed. If building or automated testing is genuinely inapplicable, explain why in the README and describe the applicable validation; do not create a no-op passing task.

An initialized but unimplemented PoC may leave results pending. Before reporting an implemented PoC complete or freezing it:

- Verify the root README is the PoC README and the original base SHA is valid.
- List the mise tasks and execute applicable build/test tasks and every prototype run task. Record observed results and explicitly identify checks that could not run.
- Inspect module responsibilities, public APIs, file sizes, examples, and dependencies against these standards. Check that supporting code uses established tools where they simplify it. Repair missing deliverables without discarding existing work or rewriting the base SHA.
- Record evidence-based learnings and unknowns. Do not label an unrun check successful or a scaffolded experiment complete.
