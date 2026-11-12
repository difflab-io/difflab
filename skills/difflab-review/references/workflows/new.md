# Review new

Run the entire review in the current single agent. Never spawn subagents or background workers. Invoke [difflab-writing-style](../../../difflab-writing-style/SKILL.md) and [difflab-bdd](../../../difflab-bdd/SKILL.md).

## 1. Verify target and scaffold artifacts

1. Confirm the repository root, initialized `.difflab` store, current branch, and non-empty diff.
2. Select the target in order: explicit plan or issue, then unique matching plan, issue, or branch. Use `YYMMDD-{slug}` for the review directory. Ask if multiple targets match or the directory already exists. Never overwrite an existing review.
3. Retain the active frontier model; switch only if the default model is not frontier or the user explicitly requests another model. With `--adversarial`, enable all optional sections (including Security) and challenge every dimension for defects.
4. Read [the review rubric](../rubric.md) and scaffold both templates:

   ```text
   scaffold({name:"code-review",cwd:<absolute repository root>,path:".difflab/reviews/YYMMDD-{slug}",filename:"REVIEW.md"})
   scaffold({name:"code-review-rubric",cwd:<absolute repository root>,path:".difflab/reviews/YYMMDD-{slug}",filename:"rubric.yaml"})
   ```

## 2. Inspect the diff and fill the rubric

1. Read applicable `AGENTS.md` files and style guides. Written rules override informal patterns.
2. Fill `review.base_revision`, `review.head_revision`, `review.working_tree`, `review.changed_files`, and `review.reviewers` in `rubric.yaml`. Record unselected optional sections in `review.exclusions`.
3. Evaluate every enabled criterion in one pass:
   - `review`: one result with `file: null`.
   - `file`: one result per changed source or test file.
   - `applicable-file`: one result per matching file.
   - Use status `PASS`, `FINDING`, `NOT_APPLICABLE`, or `SKIPPED`. Tag function findings with `locations` (`file:start-end`) and `symbol`, and link the change request in `finding`.
4. When inspecting tests (`Reliability/Testing`), apply `/difflab-bdd`:
   - Map the component's behavior flowchart (including converging state branches) from the user's or caller's perspective.
   - Check that tests follow `e2e` > `integration` > `unit` priority and produce human-verifiable outputs (screenshots, replays, file dumps, snapshots, JSON outputs, or debug logs).
   - If tests are flat, repeat downstream assertions across converged states, or duplicate fixtures, propose a concrete `[M/A/D/R]` BDD reorganization (`given` -> `when` -> `then` with hoisted fixtures) in the finding.
5. When inspecting documentation (`Documentation`), apply `/difflab-writing-style`: flag walls of text, non-domain terminology, or prose that should be replaced by a Mermaid/Draw.io diagram or `[M/A/D/R]` tree.
6. Fill `REVIEW.md` concisely using `/difflab-writing-style`. State each finding once under `## Change Requests` and link it from `## Findings` and section assessments.

## 3. Format findings and comments

- Keep each generated comment to one short sentence in simple English. Never write multi-line prose.
- Use a suggested change block, short code snippet, Mermaid behavior diagram, or `[M/A/D/R]` BDD test tree when illustrating a fix or test reorganization.
- Start recommendations with “Let's”, “I suggest”, or “I recommend”.
- End every generated comment with `> Generated via <actual model name>` unless an active flow contract forbids AI attribution.

## 4. Publish or finish locally

- For `--local`, keep findings in `REVIEW.md` and `rubric.yaml`. Do not commit, push, or call a forge.
- For remote review:
  1. Verify authenticated `gh` or `glab` access. Run format, lint, and tests on the intended changes.
  2. Commit and push intended source changes if uncommitted changes exist. Never stage `.difflab` store artifacts.
  3. Reuse an open PR for the branch or create a draft PR by scaffolding and filling `pull-request-description` per [the PR draft workflow](../../../pr/references/workflows/draft.md#description-contract).
  4. Anchor each finding to changed lines in the pushed PR diff and submit inline comments in one review with event `COMMENT` and an empty overall body. Do not approve or merge.
  5. Report `REVIEW.md`, `rubric.yaml`, commit SHA, PR URL, findings, and check results.
