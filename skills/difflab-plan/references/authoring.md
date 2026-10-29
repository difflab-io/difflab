# Write a plan people can audit and an agent can execute

Read this guide for `plan new` and `plan update`. Inspect the relevant code and applicable `AGENTS.md` files first. Use short sentences and concrete paths. Preserve requirements when shortening prose.

## Give each section one job

| Section | Contents |
| --- | --- |
| Intent | Who needs the outcome and why. |
| Requirements | Observable behavior, constraints, and explicit non-goals. |
| Big Ideas | Diagram-led explanation of changed relationships and flows. Keep decisions and constraints beside each visual. |
| Infrastructure Changes | Actual hosting, services, deployment, networking, or managed resources. Write `N/A.` if none change. New source modules belong in Repo Changes. |
| Interfaces | Short commands, signatures, code, or pseudocode showing interactions and contracts, including important failure results. |
| Consequences | Start with `Repo Changes` and its file tree. Add `Testing` with checks mapped to existing suites or manual acceptance, then trade-offs and compatibility. |
| Phases | Ordered, bounded actions with file/module targets and relevant checks. Refer to design contracts rather than repeating them. |

Use short sentences, active voice, and familiar words throughout. Prefer compact diagrams over long Big Ideas prose. Keep only decisions, constraints, and failure rules beside the visuals. Do not repeat the same explanation below a diagram. Keep the design sufficient to explain what will change and why. Adding diagrams must not move all useful design detail into a giant implementation checklist. Tasks still need enough local detail to act without the original chat.

## Show the change

- Use a component diagram for new components or changed relationships. Label responsibilities and dependencies; show before/after relationships when useful.
- Use a flowchart for a new process. Include its important branches and failure/retry behavior.
- Show new file-based artifacts as a tree or another suitable visual. Distinguish runtime data layout from repository source changes.
- Use Mermaid for diagrams and fenced text for trees. Draw the affected parts, not the whole system. A small change can use a single compact visual; omit irrelevant diagram types.

Start `Consequences` with this shape:

```text
### Consequences

#### Repo Changes

[M] modified  [A] added  [D] deleted
src/
└── feature/
    ├── [M] service.ts   owns feature policy (largest edit)
    └── [A] store.ts     owns persistence

#### Testing

Existing suite: src/invitations/service.spec.ts
└── invitation acceptance
    ├── valid request -> membership appears
    ├── expired request -> rejection; membership unchanged
    └── save fails -> membership and token changes roll back together
```

Group shared path prefixes under parent directories. Do not repeat `feature/` on sibling lines. Use inspected paths for existing files and label proposed paths as new. Put `[M]`, `[A]`, or `[D]` before each changed filename, including test files. Include removed files and identify the largest edits in a short note. State when nothing is removed. A selected tree is enough to show meaningful structural changes. Make sure that diagrams, interfaces, the tree, and phases agree.

## Specify the behavior to test

Inspect the actual test setup before proposing checks. Reuse existing suites and fixtures. Do not invent an end-to-end suite, directory, or runner. For skill-only behavior without a harness, label checks as manual acceptance. Add automated tests only for changed observable contracts in existing public APIs. Describe application or integration behavior where the repository can test it. Name the application entry point or public module API, the action, and the expected result. For example, an expired invitation must return a rejection and leave membership unchanged.

Add a `Testing` subsection under `Consequences`, as shown in the example above. Group scenarios by feature and behavior.

Map scenarios to requirements and phase checks. Reuse existing suites and fixtures. Keep Arrange/Act/Assert visible in automated tests. Name the real suite path and configured task for each automated group. Keep manual walkthroughs separate from actual live execution evidence. Assert results, saved state, and visible effects rather than private calls. Do not list every function or chase coverage percentages. Leave smaller test details to implementation and review.

Keep commit and green-CI checks when the user expects them, including `plan go --commit`. Use the execution workflow's permissions. If remote CI needs an unauthorized push, report the unmet gate rather than marking it complete.

## Fill old or customized documents

Listing or scaffolding templates installs missing files. It does not refresh existing copies. Apply this guide even when an installed template is older. Add missing subsections to the generated document and keep human content. Do not overwrite installed customizations. On update, save the revision first, then revise design, visuals, interfaces, and tasks together. Preserve phase structure and completed checkboxes unless the requested scope changes a task.

Before saving, check that every requirement has a design home and an implementation/check path. A human should be able to audit the change; an agent should be able to execute it without guessing the key contracts. Leave new implementation tasks unchecked.

## Reference examples

Read these long examples on demand when judging structure and detail:

- [Original plan](examples/plan-sources-before.md): the user's historical example, with its wording preserved. It illustrates the prose-heavy result.
- [Desired plan](examples/plan-sources-after.md): based on the user's desired output and updated for current feedback. It includes the nested Testing section.

These are format references, not instructions to modify a wiki. Their scopes differ, so shortening a plan does not permit dropping requirements. Keep the original as historical evidence. Apply new authoring rules to the desired example and bundled `plan-feature.md` and `plan-migration.md` examples. Use soft wraps for prose. Historical test commands do not set the scope of new plans.
