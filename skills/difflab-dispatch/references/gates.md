# Automerge checklist reference

Add this optional `## Automerge Checklist` section to `PLAN.md` (before `## References`) when planning a dispatched slice via `plan new`, and mirror it under `## Validation` on the pull request description. Append any slice-specific conditions approved by the user or identified from the diff:

```markdown
## Automerge Checklist

- [ ] Dispatched hunks are a verbatim subset of the source branch diff, apart from module-path adjustments and non-functional review fixes.
- [ ] Files outside the approved slice contain only module-resolution wiring (`import` or `export` paths, package manifests, `tsconfig` paths, and lockfiles).
- [ ] Continuous integration workflows and existing task scripts remain untouched, and every newly added package or suite executes in workspace test and lint runs.
- [ ] Existing `.test.ts`, `.spec.ts`, and `e2e` suites preserve their behavior and coverage without unreplaced test deletions.
- [ ] [Optional slice-specific automerge condition.]
```

## Gate evaluation rules

Evaluate every gate against `git diff <base_ref>...<dispatch_head>` after `review address` and remote continuous integration finish. Mark a checkbox `[x]` only when concrete diff and log evidence proves it:

1. Source-diff subset parity: compare every changed file in the dispatch diff against the snapshotted `git diff <base_ref>...<source_head>`. Shared files (such as `.gitignore`, `.prettierignore`, `premise.yaml`, and `mise.toml`) can include only slice-relevant lines that appear verbatim in the source diff. Allow module-path adjustments required on `<base_ref>` and non-functional `review address` fixes (comments, section-divider order, code layout, and Markdown prose). Block automatic merge on newly synthesized logic, stripped assertions, or functional code edits. Treat ambiguous edits as functional.
2. Approved file scope: inspect `git diff --name-only <base_ref>...<dispatch_head>`. Every touched path outside the approved slice must contain only module-resolution wiring (`import` or `export` specifiers, `package.json` workspace dependencies or `exports`, `tsconfig` path entries, or lockfiles).
3. Continuous integration and runner discovery: fail immediately if the diff edits `.github/workflows/**`, `.gitlab-ci.yml`, `premise.yaml` flow or provider blocks, or existing task scripts in `mise.toml`. Allow scaffolded per-package `mise.toml` files for newly added packages and matching `projects:` or `config_roots` registrations from the source pull request. Make sure that task-runner output proves every newly added package or test suite executed.
4. Existing test stability: inspect all modified or deleted `.test.ts`, `.spec.ts`, and `e2e` files that exist on `<base_ref>`. Permit only symbol renames and import-path updates, and forbid deleting or skipping existing tests unless the approved slice includes the replacement suite.
5. Remote runs, threads, and custom items: make sure that all required continuous integration and `e2e` runs on `<dispatch_head>` succeeded, zero unresolved review threads remain on the dispatch pull request, and every custom item in `## Automerge Checklist` holds.
