# Review new

1. Make sure that the repository root, initialized `.difflab` store, current branch, and actual diff match the review target. Do not review an empty or unrelated diff.

   With `--bg`, delegate this workflow to a native background subagent with the exact target. For remote mode, grant permission to commit, push, create a draft PR, and post inline findings. For `--local`, grant no remote or commit rights. Return control immediately. If the target is ambiguous, a check fails, or forge access is unavailable, the worker stops and reports the blocker. The worker never asks for permissions during the run. If native background capability is unavailable, report that limit. Do not pretend to start a background review.

2. Select the target in this order: an explicit plan or issue, then a unique matching plan, issue, or branch. A focus such as “security” directs review depth. It does not determine the artifact slug, the short name used in its path. Use `YYMMDD-{slug}`.

   In foreground mode, ask if several targets match or the review directory already exists. In `--bg`, stop and report the ambiguity. Do not overwrite an existing review.

3. Read [the review rubric](../rubric.md). Scaffold both required templates into the selected review directory:

   ```text
   scaffold({name:"code-review",cwd:<absolute repository root>,path:".difflab/reviews/YYMMDD-{slug}",filename:"REVIEW.md"})
   scaffold({name:"code-review-rubric",cwd:<absolute repository root>,path:".difflab/reviews/YYMMDD-{slug}",filename:"rubric.yaml"})
   ```

   Read both resulting files. Use the installed rubric template, including its customizations. Do not overwrite either file. If rubric scaffolding fails, stop and report the failure. Do not proceed with a review that lacks the rubric. Fill its results using the instructions below. Do not create a separate CSV. Apply this procedure in foreground and background modes.

   Use `REVIEW.md` for the broad assessment, material findings, change requests, and verification results. Use `rubric.yaml` as the detailed checklist that records which criteria and files were inspected. Keep file-level checklist detail out of the prose report unless it explains a finding or limit.

   Select optional sections, then delegate each enabled rubric section using the instructions below before filling its results. This requirement applies to foreground, background, local, and remote reviews. In `--bg`, the background lead must create the section workers too.

   Use the rubric's section criteria to assess the change. Read root and applicable nested `AGENTS.md` files before assessing criteria. Apply their rules throughout every section. When a repository rule differs from a generic rubric convention, use the repository rule. Cite violations under the relevant criterion. Distinguish established conventions from personal preferences. Inspect language conventions, codebase patterns, names, module roles, existing types and helpers, and test fixtures. Request the refactor needed to make unclear code understandable. Fill criterion results with concrete evidence as each inspection finishes. Use default severities as starting points and record any adjustment.

   Assess application behavior first, then module public APIs, then focused unit behavior. Require clear Arrange/Act/Assert blocks. Every comment and reply must use simple English and be as short as possible. Include a suggested change when a concrete fix is available. Each finding needs evidence and an effect on comprehension, rules, or behavior. Use the requested focus to deepen the review. Omit nitpicks and minor optimizations, even during a deeper audit. Do not invent findings or request tests solely because a private function lacks one.

   Fill every applicable section of `REVIEW.md`. Preserve its headings and human text. Do not add a separate section or tally for repository guidance. Do not rewrite installed templates. Record the diff or commit, base and head revisions, intent, reviewer, executed checks, and skipped checks. Keep section assessments concise. Link the completed YAML rubric under `Verification and Limits`. If applicable guidance cannot be read, disclose that limit there.

4. For `--local`, add generated findings under `## Change Requests` in `REVIEW.md`. Do not commit, push, contact a forge, create a PR, or make any remote write. Apply the attribution and reporting rules below without entering the remote steps.

5. For remote review, make sure that `gh` or `glab` has authenticated access. Run format, lint, and tests on the intended change set. Inspect staged and untracked paths for secrets and unrelated files. Stage only intended source and configuration changes. Do not stage `.difflab` project-store artifacts.

   If there are uncommitted changes, create a conventional commit without agent self-attribution. Push the branch. If a commit, push, or check fails, stop before creating a PR or posting findings. Never force-push merely to start a review.

6. Reuse a suitable existing PR. Otherwise, scaffold `pull-request-description` to a distinct file in the review directory, such as `PR-DRAFT.md`. Do not overwrite an existing file. Fill every `{{...}}` placeholder. Open a draft PR from the pushed branch with that file as its body.

   After pushing, read the actual PR diff again. Anchor findings to changed lines in that diff. Do not use stale working-tree lines. Use the forge CLI's authenticated API when needed to post inline change requests on the PR. Never post a finding against an unmapped or outdated diff line.

   Reconcile the filled rubric with this diff before publication. Reassess affected file results and review-wide conclusions. Do not publish findings from stale evidence.

   Publish every verified inline finding before `review new` finishes. This applies in foreground and `--bg` modes. This invocation authorizes posting the review. Do not post an overall comment. On GitHub, create the pending review with inline comments. Submit it with event `COMMENT` and an empty overall body. On forges without pending reviews, post inline comments directly. If the forge cannot publish inline-only comments, stop and report the blocker.

7. End every generated finding or comment with `> Generated via <actual model name>`. Keep human comments verbatim. If the model name is unavailable, stop before posting comments. Do not guess.

8. Check that every required section worker finished and every required criterion result is filled using the instructions below. Make sure that the review is published and its comments belong to the intended PR threads. Report the exact REVIEW.md and rubric.yaml paths, commit SHA, PR identity, findings, executed checks, skipped checks, and forge or authentication failures. Disclose missing workers and missing, pending, skipped, or stale results instead of claiming a complete review. For `--local`, report the applicable local results without contacting a forge.

   Do not approve or merge as part of `new`. If publication fails, report the pending review ID. Do not claim that the review is complete. If there are no findings, do not create an empty review or invent comments.

## Delegate each rubric section

The lead reviewer must create one distinct native subagent per enabled section that contains criteria in the scaffolded YAML. The bundled rubric requires six sections: Intent Delivery, Readability, Semantic Organization, Maintainability, Reliability/Testing, and Performance. Security has `optional: true`. Enable it only when the user explicitly requests a security review or security focus. Derive assignments from the actual template, including customized sections. Enable other optional sections only when explicitly requested. Record unselected sections in `review.exclusions` with the reason. Leave their results empty and mark them as not selected in `REVIEW.md`. An unselected optional section is not incomplete work and needs no worker. The lead writes report-only sections such as Findings and Overall Assessment. Do not substitute role-playing or a single worker covering several enabled sections.

Request an available Opus or Sol model with medium reasoning effort for section workers. If Security is selected, request high reasoning effort for its worker. Use actual model identifiers and reasoning controls exposed by the runtime. Do not invent identifiers or treat a prompt saying “think hard” as a configured reasoning setting. Use a higher-tier model only when the user explicitly requests it. If the required model, reasoning control, or native delegation is unavailable, report the blocker before proceeding. Do not silently change the model policy or claim that the required settings were used.

Run workers concurrently within the runtime's available slots. If slots are limited, run distinct workers in batches or sequentially. Do not drop enabled sections to fit the concurrency limit. In `--bg`, the background lead coordinates these workers. If nested delegation is unavailable, report that limitation instead of skipping the requirement.

Give each worker the same repository root, base and head revisions, working-tree state, changed-file inventory, intent, focus, and applicable guidance. Give it its assigned section, criterion definitions, the evidence guide, and these result and comment instructions. Each worker owns only the inspection of its assigned section. It must inspect every file required by the criterion scopes and return results with evidence, exclusions, file/function locations, and concise suggested changes.

Workers are not alone in the checkout. They must not edit source, change either shared review file, revert others' edits, commit, push, create a PR, or publish comments. They return their results to the lead. The lead coordinates project checks and gives workers any check results needed for their assessments. Workers must report unverified behavior honestly.

Record worker assignments and outcomes in `review.section_reviewers` in the copied YAML. For each section, record its title, agent identity, actual model, actual reasoning setting, and completion status. Do not claim settings that the runtime cannot confirm. A worker must report its actual model identity for generated-comment attribution.

The lead waits for every assigned worker, combines its results into the shared checklist, and verifies proposed findings against the diff. Group duplicate findings from different sections while preserving each criterion's result. Resolve conflicting assessments using evidence. Return missing or unsupported results to the assigned worker for completion. If the diff changes, send affected work back to the relevant section workers before publication. Do not claim a completed review while an enabled section's worker is missing or incomplete.

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

Run the optional Security dimension when explicitly requested. Deepen performance audits when explicitly requested. Record any unperformed requested audit as a limit. If Security is not selected, say so without claiming a security audit or marking the review incomplete. Still report clear security defects discovered during other inspections. If a deeper performance audit is not warranted, mark that audit `SKIPPED` with a reason. Record actual commands and results. Distinguish code inspection from executed checks and measurements.

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

Public APIs are the operations available to callers. Follow the architecture the project uses. For example, in Model-View-Controller (MVC), responsibilities belong to models, views, or controllers. Do not impose MVC on a project that does not use it.

Request the scope needed to fix the problem, including changes across files. Keep unrelated work out of scope.

### Maintainability

Cyclomatic complexity counts independent paths through code. If no measurement was run, describe added decisions without claiming a measured score.

DRY means “do not repeat yourself.” Inspect existing code before requesting reuse. Apply the file-placement criteria when proposing a dedicated utility file.

Do not recommend a dependency solely because a package exists. Establish that its API fits the required behavior.

### Reliability/Testing

Prioritize application behavior, then module public APIs, then focused unit behavior. High line or function coverage does not establish application or module contracts.

Do not demand a test per function, a coverage percentage, exported private helpers, or tests of private call sequences. Do not duplicate behavior already established through public APIs.

Test an internal algorithm directly only when its distinct behavioral risk cannot reasonably be isolated through public APIs. Avoid mocks that replace the interaction or result being tested.

This priority order does not require three test layers for every change. Use explicit Arrange/Act/Assert labels in tests with several steps, or the language equivalent. Labels alone do not fix interleaving.

Do not introduce a fixture framework or hide behavior just to remove a few repeated lines. Tests of `isExpired` do not prove that accepting an expired invitation leaves membership unchanged.

The plan skill lists exact end-to-end/integration scenarios under `Consequences → Testing`. Do not copy lower-level coverage advice into generated plans.
