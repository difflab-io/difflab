# Review new

1. Make sure that the repository root, initialized `.difflab` store, current branch, and actual diff match the review target. Do not review an empty or unrelated diff.

   With `--bg`, delegate this workflow to a native background subagent with the exact target. For remote mode, grant permission to commit, push, create a draft PR, and post inline findings. For `--local`, grant no remote or commit rights. Return control immediately. If the target is ambiguous, a check fails, or forge access is unavailable, the worker stops and reports the blocker. The worker never asks for permissions during the run. The background lead covers the full rubric or coordinates full council reviewers. It must not spawn section agents. If native background capability is unavailable, report that limit. Do not pretend to start a background review.

2. Select the target in this order: an explicit plan or issue, then a unique matching plan, issue, or branch. A focus such as “security” directs review depth. It does not determine the artifact slug, the short name used in its path. Use `YYMMDD-{slug}`.

   In foreground mode, ask if several targets match or the review directory already exists. In `--bg`, stop and report the ambiguity. Do not overwrite an existing review.

3. Read [the review rubric](../rubric.md). Scaffold both required templates into the selected review directory:

   ```text
   scaffold({name:"code-review",cwd:<absolute repository root>,path:".difflab/reviews/YYMMDD-{slug}",filename:"REVIEW.md"})
   scaffold({name:"code-review-rubric",cwd:<absolute repository root>,path:".difflab/reviews/YYMMDD-{slug}",filename:"rubric.yaml"})
   ```

   Before scaffolding, resolve models and modes through [model selection and council](#model-selection-and-council). Preflight all report and rubric destinations, including council files. Read both resulting files. Use the installed rubric template, including its customizations. Do not overwrite either file. If rubric scaffolding fails, stop and report the failure. Do not proceed with a review that lacks the rubric. Fill its results using the instructions below. Do not create a separate CSV. Apply this procedure in foreground and background modes.

   Use `REVIEW.md` for the broad assessment, material findings, change requests, and verification results. Use `rubric.yaml` as the detailed checklist that records which criteria and files were inspected. Keep file-level checklist detail out of the prose report unless it explains a finding or limit.

   Select optional sections, then inspect every enabled criterion in the same reviewer. In council mode, repeat the complete inspection for each selected model. Do not delegate dimensions.

   Read root and applicable nested AGENTS.md files and named style guides. Written rules override generic preferences. Use existing patterns as context, not as mandatory rules. Flag material defects and antipatterns even when nearby code shares them. Do not demand consistency with poor informal practices or flag harmless differences alone. Each finding needs a written rule or a concrete effect on behavior, comprehension, or maintenance. Keep fixes within the reviewed change.

   Assess application behavior first, then module public APIs, then focused unit behavior. Require clear Arrange/Act/Assert blocks. Every comment and reply must use simple English and be as short as possible. Include a suggested change when a concrete fix is available. Each finding needs evidence and an effect on comprehension, rules, or behavior. Use the requested focus to deepen the review. Omit nitpicks and minor optimizations, even during a deeper audit. Do not invent findings or request tests solely because a private function lacks one.

   Fill every applicable section of `REVIEW.md`. Preserve its headings and human text. Do not add a separate section or tally for repository guidance. Do not rewrite installed templates. Record the diff or commit, base and head revisions, intent, reviewer, executed checks, and skipped checks. Use one short assessment or a link to a finding per section. State each finding once under Change Requests; use short links in the Findings table. Keep per-file inspection detail in YAML. Use short sentences, active voice, and familiar words throughout. Remove repeated context and long code summaries. Link the completed YAML rubric under `Verification and Limits`. If applicable guidance cannot be read, disclose that limit there.

4. For `--local`, add generated findings under `## Change Requests` in `REVIEW.md`. Do not commit, push, contact a forge, create a PR, or make any remote write. Apply the attribution and reporting rules below without entering the remote steps.

5. For remote review, make sure that `gh` or `glab` has authenticated access. Run format, lint, and tests on the intended change set. Inspect staged and untracked paths for secrets and unrelated files. Stage only intended source and configuration changes. Do not stage `.difflab` project-store artifacts.

   If there are uncommitted changes, create a conventional commit without agent self-attribution. Push the branch. If a commit, push, or check fails, stop before creating a PR or posting findings. Never force-push merely to start a review.

6. Reuse a suitable existing PR without overwriting its description. Otherwise, follow the [PR description contract](../../../pr/references/workflows/draft.md#description-contract). Scaffold the installed `pull-request-description` template to a distinct file such as `PR-DRAFT.md`. Fill Intent, Changes, Validation, Further Work, and References from the actual diff and verified checks. Preserve custom sections. Stop for a missing template or unresolved placeholders. Open a draft with that body, then read it back and compare it with the intended text.

   After pushing, read the actual PR diff again. Anchor findings to changed lines in that diff. Do not use stale working-tree lines. Use the forge CLI's authenticated API when needed to post inline change requests on the PR. Never post a finding against an unmapped or outdated diff line.

   Reconcile the filled rubric with this diff before publication. Reassess affected file results and review-wide conclusions. Do not publish findings from stale evidence.

   Publish every verified inline finding before `review new` finishes. This applies in foreground and `--bg` modes. This invocation authorizes posting the review. Do not post an overall comment. On GitHub, create the pending review with inline comments. Submit it with event `COMMENT` and an empty overall body. On forges without pending reviews, post inline comments directly. If the forge cannot publish inline-only comments, stop and report the blocker.

7. End every generated finding or comment with `> Generated via <actual model name>`. Keep human comments verbatim. If the model name is unavailable, stop before posting comments. Do not guess.

8. Check that every selected model completed the full review and every required criterion result is filled using the instructions below. Make sure that the review is published and its comments belong to the intended PR threads. Report the exact REVIEW.md and rubric.yaml paths, commit SHA, PR identity, findings, executed checks, skipped checks, and forge or authentication failures. Disclose incomplete model passes and missing, pending, skipped, or stale results instead of claiming a complete review. For `--local`, report the applicable local results without contacting a forge.

   Do not approve or merge as part of `new`. If publication fails, report the pending review ID. Do not claim that the review is complete. If there are no findings, do not create an empty review or invent comments.

## Model selection and council

These are natural-language skill options, not new CLI syntax. Resolve capabilities before creating artifacts. Use the runtime's actual selected model and catalog. Retain the selected model if it is frontier. Otherwise select a confirmed available frontier model. Honor explicit user choices first, including non-frontier council models. If frontier status or switching capability is unknown, disclose that limit and ask for a supported choice. In background mode, report it as a blocker. Never replace a selected frontier Gemini or another vendor's model merely because an old template names Sol or Opus.

The bundled `review_defaults.model_policy: retain-frontier` documents this policy. Record actual model identity, confirmed reasoning setting when available, and status in `review.reviewers`. Do not invent reasoning settings. Legacy `worker_defaults`, section `worker`, and `section_reviewers` fields remain preserved as custom data. They cannot create section agents or override current model policy. Disclose ignored legacy execution settings in Verification and Limits. Preserve custom criteria and unrelated configuration.

Without council, one reviewer inspects all enabled sections. Security stays optional unless explicitly requested. Enable other optional sections on explicit request. Record unselected sections and reasons in `review.exclusions`; leave their results empty. With `--adversarial`, enable every applicable optional dimension, including Security, and challenge all dimensions for defects. Actively look for security faults, semantic gaps, misleading names, unclear flows, missing intent, and reliability or performance problems. Do not invent defects, inflate severity, require a finding count, or demand unrelated hardening.

### Resolve names before starting

For `--council model-a,model-b`, split on commas and trim whitespace. Match each input against the actual available model catalog:

1. Prefer an exact identifier or known alias after normalizing case, spaces, and punctuation.
2. Accept a clear fuzzy match, including a minor typo. People need not provide exact identifiers. Do not merge distinct version or tier identifiers during normalization.
3. If several candidates remain plausible, show them and ask. In background mode, report the ambiguity instead. Do not silently choose the first or cheapest candidate.
4. Record each supplied name and its resolved actual identity in `review.model_inputs`. Reject empty entries, duplicate resolved identities, unavailable models, and unsupported invocation capabilities before starting.

A bare `--council` selects all distinct frontier models that the runtime confirms are available and invokable. Record that list before inspection. If fewer than two are available, report insufficient council capability. An explicit one-model list is valid; disclose that it requests one perspective.

### Run complete independent passes

Use one full reviewer per model. Native model agents are allowed for council, including under a background lead. Run concurrently when supported or in batches when slots are limited. Do not split a model's rubric by dimension. Give each reviewer the same repository root, base/head revisions, working-tree snapshot, changed-file inventory, intent, guidance, rubric definitions, focus, and mode. Do not give it prior council findings.

Scaffold the installed `code-review` and `code-review-rubric` templates for every pass:

```text
.difflab/reviews/YYMMDD-<slug>/
├── [A] REVIEW.md
├── [A] rubric.yaml
└── [A] council/
    ├── [A] <actual-model>.md
    └── [A] <actual-model>.rubric.yaml
```

Use the resolved actual model name, not the fuzzy input, as the filename stem. Keep safe stems unchanged. For unsafe names, encode UTF-8 bytes outside `[A-Za-z0-9._-]` as `%HH`; encode `%` too. Encode a stem equal to `.` or `..` in full. Record the mapping in `review.model_inputs`. Reject filesystem name collisions, including case-insensitive collisions, before scaffolding. Never follow a model name outside `council/` or overwrite an existing report. If the filesystem cannot store a name, stop and report it.

Each model reviewer owns only its own report and rubric. Reviewers are not alone in the checkout. They must not edit source, shared reports, another reviewer's work, or revert others' changes. They cannot commit, push, or publish. The lead coordinates shared checks and publication. Every model records actual identity and completion state. If the runtime cannot invoke a selected model, stop without pretending to run it or silently substituting another. If direct model switching is used, restore the caller's selection when possible and disclose failures.

### Aggregate and publish once

Wait for every requested pass. Keep completed artifacts after a failure, mark the aggregate incomplete, and stop before publication. Group findings by root cause and affected behavior. Verify each claim against the same diff. A supported finding from one model stays eligible without majority agreement. Resolve disagreements through evidence and record unresolved claims as limits.

Fill the top-level report and rubric from verified pass results. Preserve links to source reports, per-model criterion coverage, and actual model provenance. In the aggregate rubric, use `model_results` with each model's rubric path and completion state. Do not mark aggregate criteria complete while a required pass lacks coverage. Attribute each report to its actual model and synthesized comments to the model that writes them, using the skill's attribution rule unless the user explicitly overrides it.

Re-read the actual diff after any check, commit, or push that can change evidence. Update the changed-file inventory and repeat affected inspections for every selected model before publication. Publish the aggregate findings once through the lead's authorized remote workflow. Do not post each council report separately. Review address acts on aggregate requests once.

## Fill the copied rubric

Fill `review.base_revision`, `review.head_revision`, and `review.changed_files` from the actual diff. Include added, modified, renamed, deleted, binary, and non-code files in the inventory. Use repository-relative paths. For renames, use the new path and record the old path in the evidence. For deletions, use the old path. If uncommitted changes are included, describe their state in `review.working_tree`.

Leave criterion definitions unchanged in the copy. Fill each criterion's `results` list according to its `scope`:

- `review`: Inspect the relevant change as a whole. Add one result with `file: null` and cite supporting files or behavior.
- `file`: Inspect every changed source file, including test files. Add one result per file. A section summary does not replace individual file results. Inspect removals through their effect on surrounding code. Assess binary assets and non-code changes through review-scoped criteria.
- `applicable-file`: Inspect every file that meets `applies_when`. Add one result per matching file. Record exclusions by criterion and category once in `review.exclusions`. Do not add a result for every excluded file.

Use these result fields:

```yaml
results:
  - file: src/example.ts
    status: PASS
    evidence: The function name matches its read-only behavior.
    finding: null
```

Use `PENDING`, `PASS`, `FINDING`, `NOT_APPLICABLE`, or `SKIPPED` as the status. Record a concrete observation for `PASS`. For `FINDING`, record evidence and reference the actionable change request in `finding`. For `NOT_APPLICABLE` or `SKIPPED`, explain the reason. Use `SKIPPED` when inspection is incomplete, rather than treating the criterion as inapplicable. If severity differs from `default_severity`, add `severity` to the result and explain the adjustment in `evidence`.

Every file-level result must tag its repository-relative path in `file`. For a finding about a function or specific code, add `locations` with `file:line` or `file:start-end` references. Add the function name in `symbol` when useful. Keep the file result even when several functions have findings. Reference their change requests in `finding`. Review-scoped findings must also tag affected code locations when available.

```yaml
results:
  - file: src/example.ts
    status: FINDING
    locations:
      - src/example.ts:12-20
    symbol: loadSettings
    evidence: The function also writes defaults.
    finding: REVIEW.md#rename-loadsettings
```

Use `blocking` for issues that must be resolved before merge. Missing required behavior and failure to deliver stated intent default to blocking. Use `consider` for material changes or focused discussion that do not automatically block merge. Use `note` for a concise material observation. Omit nitpicks and cosmetic preferences. Severity defaults are starting points. Adjust them to demonstrated impact and record why.

Fill results only after inspection. A passing command alone does not prove every criterion. Before finishing, compare the results with the changed-file inventory. Make sure that every required file and criterion in enabled sections has exactly one result. Empty lists are valid for unselected optional sections or applicable-file criteria with no matching files and a recorded exclusion. Explain missing, pending, skipped, or stale results from enabled sections under `Verification and Limits`.

If the diff changes, update the inventory and reassess affected results before reporting completion. Do not reuse evidence from an earlier revision without checking it again. A completed form records inspection. It does not prove that the inspection was thorough.

## Write findings and comments

Read enough surrounding code to establish what each changed location does. Before writing a finding, connect that location to concrete evidence, its effect, and the needed change or question. A material comprehension issue is valid without a runtime bug. Request the refactor that fixes its cause, including changes across files when needed.

Use the shortest simple-English wording that preserves the problem and useful fix. Prefer one short sentence when it is enough. Include a suggested change when possible. Start recommendations with “Let's”, “I suggest”, or “I recommend”. Put the file and line in the comment location. Do not repeat a long code summary. Include a short snippet or suggested patch only when it clarifies the fix.

Group repeated instances of one cause. Keep severity clear and justify it by demonstrated impact. A readability issue is not automatically blocking. Preserve human comments. Base the overall recommendation on material findings and known limits. Keep the section assessments and overall recommendation concise. A clean review can have no change requests.

Run the optional Security dimension for an explicit security focus or --adversarial. Deepen performance audits for an explicit performance focus or --adversarial. Record any unperformed requested audit as a limit. If Security is not selected, say so without claiming a security audit or marking the review incomplete. Still report clear security defects discovered during other inspections. If a deeper performance audit is not warranted, mark that audit `SKIPPED` with a reason. Record actual commands and results. Distinguish code inspection from executed checks and measurements.

These examples illustrate the rubric. They are not findings about this repository:

- “`loadSettings` also saves defaults. I suggest a name that shows the write.”
- “This handler formats paths and writes records. Let's move that work into the existing store.”
- “`isComplete` duplicates `status`. I recommend deriving it from the existing field.”
- “Repeated setup hides this test's action. I suggest a fixture and separate Arrange, Act, and Assert blocks.”
- “These helper tests do not prove that the report is saved. Let's add an integration test through the public API.”

Append the required model attribution to every generated comment or reply, including comments based on these examples. Put actionable findings in the required local or remote destination. Use accurate line mappings. Do not claim an audit, check, or measurement that did not run.

## Apply the review criteria

### Readability

A comprehension finding does not require a runtime bug. Explain the effect on the reader.

### Semantic Organization

Public APIs are the operations available to callers. Use the architecture as context. Follow written project rules, but flag material role or ownership problems even when existing code shares them. For example, in Model-View-Controller (MVC), responsibilities belong to models, views, or controllers. Do not impose MVC on a project that does not use it.

Request the scope needed to fix the problem, including changes across files. Keep unrelated work out of scope.

Public APIs must make sense for the module's role. Export semantically meaningful types. Methods and classes must be easy to discover and use. Show concrete caller confusion before requesting an API change.

### Maintainability

Cyclomatic complexity counts independent paths through code. If no measurement was run, describe added decisions without claiming a measured score.

DRY means “do not repeat yourself.” Inspect existing code before requesting reuse. Apply the file-placement criteria when proposing a dedicated utility file.

Do not recommend a dependency solely because a package exists. Establish that its API fits the required behavior.

### Reliability/Testing

Prioritize application behavior, then module public APIs, then focused unit behavior. High line or function coverage does not establish application or module contracts.

Tests must establish behavior of the repository's own source code. Trace assertions to that behavior. Flag tests that merely confirm external dependency behavior. Tests can use real dependencies when they establish the repository's own integration contract. Do not replace meaningful integration tests with mocks solely because they use dependencies.

Every test name must identify the function or functionality under test and its expected behavior. Apply this rule regardless of behavior-driven grouping or any other test organization. Grouping style does not excuse a name that hides the subject or expected result.

Do not demand a test per function, a coverage percentage, exported private helpers, or tests of private call sequences. Do not duplicate behavior already established through public APIs.

Test an internal algorithm directly only when its distinct behavioral risk cannot reasonably be isolated through public APIs. Avoid mocks that replace the interaction or result being tested.

This priority order does not require three test layers for every change. Use explicit Arrange/Act/Assert labels in tests with several steps, or the language equivalent. Labels alone do not fix interleaving.

Do not introduce a fixture framework or hide behavior just to remove a few repeated lines. Tests of `isExpired` do not prove that accepting an expired invitation leaves membership unchanged.

The plan skill lists behavior checks under `Consequences → Testing`, using existing suites or clearly labeled manual checks. Do not copy lower-level coverage advice into generated plans.

### Documentation

Use simple English and short explanations. Flag walls of text and documentation that merely restates code. Keep context that explains intent, constraints, or use. Prefer diagrams when they explain structures, flows, or relationships more clearly than long prose. Do not require a diagram when a short explanation is clearer.
