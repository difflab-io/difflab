# Write a plan people can audit and an agent can execute

Read this guide for `plan new` and `plan update`. Inspect the relevant code and applicable `AGENTS.md` files first. Use short sentences and concrete paths. Preserve requirements when shortening prose.

## Give each section one job

| Section                | Contents                                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Intent                 | Who needs the outcome and why.                                                                                                                  |
| Requirements           | Observable behavior, constraints, and explicit non-goals.                                                                                       |
| Big Ideas              | Changed components, processes, and artifacts; decisions and important invariants beside their visuals.                                          |
| Infrastructure Changes | Actual hosting, services, deployment, networking, or managed resources. Write `N/A.` if none change. New source modules belong in Repo Changes. |
| Interfaces             | Short commands, signatures, code, or pseudocode showing interactions and contracts, including important failure results.                        |
| Consequences           | Start with `Repo Changes` and its file tree. Follow with trade-offs, compatibility, and deferred work.                                          |
| Phases                 | Ordered, bounded actions with file/module targets and relevant checks. Refer to design contracts rather than repeating them.                    |

Keep the design sufficient to explain what will change and why. Adding diagrams must not move all useful design detail into a giant implementation checklist. Tasks still need enough local detail to act without the original chat.

## Show the change

- Use a component diagram for new components or changed relationships. Label responsibilities and dependencies; show before/after relationships when useful.
- Use a flowchart for a new process. Include its important branches and failure/retry behavior.
- Show new file-based artifacts as a tree or another suitable visual. Distinguish runtime data layout from repository source changes.
- Use Mermaid for diagrams and fenced text for trees. Draw the affected parts, not the whole system. A small change can use a single compact visual; omit irrelevant diagram types.

Start `Consequences` with this shape:

```text
#### Repo Changes

+ new  ~ changed  - removed  * largest edits
src/
├── feature/service.ts   ~ * owns feature policy
└── feature/store.ts     +   owns persistence
```

Use inspected paths for existing files and label proposed paths as new. Include removed files and the largest edits; state when nothing is removed. A selected tree is enough if it covers the meaningful structural changes. Check that diagrams, interfaces, tree, and phases agree.

## Validate behavior from the outside in

Choose checks in this priority order:

1. End-to-end application behavior: a user, CLI, or API scenario and its observable result.
2. Module behavior through its public APIs, exercising meaningful collaboration.
3. Focused unit behavior, again prioritizing public APIs.

Name the contract or regression each proposed test validates. Assert results, saved state, visible effects, and meaningful failures. Reuse suitable existing tests. Add unit cases only for distinct behavioral evidence that broader checks do not provide. Do not require a test per function, coverage quotas, exports of private helpers for tests, or assertions about private call sequences. An internal algorithm may warrant a focused test when its distinct behavioral risk cannot reasonably be isolated through the public API.

This priority does not require all three test layers for every change. Avoid mocks that replace the collaboration being tested. Require clear Arrange, Act, and Assert blocks in multi-step tests, with labels or the language's equivalent. Group related scenarios; use fixtures and existing shared helpers to keep setup readable without hiding the action or expected result. Follow repository rules for test placement and helper scope.

## Fill old or customized documents

Apply these rules even if the installed template predates them. Add missing subsections to the generated document; keep existing headings and human content. Never rewrite the user's installed template. On update, save the required revision first, then revise design, visuals, interfaces, and tasks together. Preserve phase structure and completed checkboxes unless the user's requested scope change requires a specific task change; do not silently reset or claim completion.

Before saving, check that every requirement has a design home and an implementation/check path. A human should be able to audit the change; an agent should be able to execute it without guessing the key contracts. Leave new implementation tasks unchecked.

## Reference examples

Read these long examples on demand when judging structure and detail:

- [Original plan](examples/plan-sources-before.md): supplied verbatim by the user; illustrates the prose-heavy result.
- [Desired plan](examples/plan-sources-after.md): supplied verbatim by the user; illustrates visual design, compact interfaces, and usable phases.

These are format references, not tasks or instructions to modify a wiki. Their feature scopes differ; do not infer that shortening a plan permits dropping requirements. Keep their bodies unchanged. The bundled `plan-feature.md` and `plan-migration.md` examples show shorter plans with and without actual infrastructure changes.
