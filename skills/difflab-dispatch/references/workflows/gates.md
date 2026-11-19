# Dispatch automerge gates

Include this `### Automerge Checklist` subsection under `## Validation` when drafting the dispatch pull request description. Append any user-supplied or agent-identified slice conditions:

```markdown
### Automerge Checklist

- [ ] Dispatched hunks are a verbatim subset of the source branch diff, apart from module-path adjustments and non-functional review fixes.
- [ ] Files outside the approved slice contain only module-resolution wiring (`import` or `export` paths, package manifests, `tsconfig` paths, and lockfiles).
- [ ] Continuous integration workflows and existing task scripts remain untouched, and every newly added package or suite executes in workspace test and lint runs.
- [ ] Existing `.test.ts`, `.spec.ts`, and `e2e` suites preserve their behavior and coverage without unreplaced test deletions.
- [ ] [Additional user-specified or agent-determined automerge condition.]
```

## Gate evaluation rules

Evaluate every gate against `git diff <base_ref>...<dispatch_head>` after `review address` and remote continuous integration finish. Mark an item `[x]` only when concrete diff and log evidence proves it:

1. Source-diff subset parity: compare every changed file in the dispatch diff against the snapshotted `git diff <base_ref>...<source_head>`. Shared files (such as `.gitignore`, `.prettierignore`, `premise.yaml`, and `mise.toml`) can include only slice-relevant lines when each added or removed line appears verbatim in the source diff. Allow module-path adjustments required by `<base_ref>` and non-functional edits from `review address` (comments, section-divider order, code layout, and Markdown prose). Block automatic merge on any newly synthesized code, stripped assertions, or functional statement or control-flow edit. When an edit is ambiguous, treat it as functional and leave the pull request open.
2. Approved file scope: inspect `git diff --name-only <base_ref>...<dispatch_head>`. Every touched path outside the approved slice list must contain only module-resolution wiring (`import` or `export` specifiers, `package.json` workspace dependencies or `exports`, `tsconfig` path entries, or lockfile updates). Any behavioral or schema edit in an unapproved file fails this gate.
3. Continuous integration and runner discovery: fail immediately if the diff modifies `.github/workflows/**`, `.gitlab-ci.yml`, `premise.yaml` flow or provider blocks, or existing task scripts in `mise.toml`. Allow scaffolded per-package `mise.toml` files for newly added packages and matching `projects:` or `config_roots` registrations from the source pull request. Make sure that task-runner logs prove every newly added package or test suite actually executed during lint and test runs.
4. Existing test stability: inspect all modified or deleted `.test.ts`, `.spec.ts`, and `e2e` files that already exist on `<base_ref>`. Permit only symbol renames and import-path updates. Forbid deleting or skipping existing tests unless the approved slice includes the replacement test suite covering the moved behavior.
5. Remote runs, threads, and custom items: make sure that all required remote continuous integration and `e2e` runs on `<dispatch_head>` succeeded, zero open or deferred review threads remain on the dispatch pull request, and every custom item in `### Automerge Checklist` holds.
