# Review new

Run the entire review in the current single agent without subagents or background workers. Invoke [difflab-writing-style](../../../difflab-writing-style/SKILL.md) and [difflab-bdd](../../../difflab-bdd/SKILL.md). Read applicable `AGENTS.md` files before inspecting changes.

## 1. Prepare target and scaffold artifacts

1. Make sure that you resolve the repository root, initialized `.difflab` store, current branch, and non-empty diff.
2. Select the target in order: explicit plan or issue, then unique matching plan, issue, or branch. Use `YYMMDD-{slug}` for the review directory, and never overwrite an existing review. If multiple targets match or the directory exists, ask the user.
3. Retain the active frontier model unless the user requests another model. With `--adversarial`, enable all optional sections (such as Security) and challenge every dimension for defects.
4. Read [the review rubric](../rubric.md) and scaffold both templates via MCP `scaffold` or CLI `difflab templates scaffold`:

   ```text
   scaffold({name:"code-review",cwd:<absolute repository root>,path:".difflab/reviews/YYMMDD-{slug}",filename:"REVIEW.md"})
   scaffold({name:"code-review-rubric",cwd:<absolute repository root>,path:".difflab/reviews/YYMMDD-{slug}",filename:"rubric.yaml"})
   ```

## 2. Inspect the diff and fill the rubric

1. Read applicable `AGENTS.md` files and style guides because written rules override informal patterns.
2. Fill `review.base_revision`, `review.head_revision`, `review.working_tree`, `review.changed_files`, and `review.reviewers` in `rubric.yaml`, and list unselected optional sections in `review.exclusions`.
3. Evaluate every enabled criterion in one pass with status `PASS`, `FINDING`, `NOT_APPLICABLE`, or `SKIPPED`:
   - `review`: record one result with `file: null`.
   - `file`: record one result per changed source or test file.
   - `applicable-file`: record one result per matching file, and tag function findings with `locations` (`file:start-end`), `symbol`, and `finding`.
4. For `Reliability/Testing`, apply `/difflab-bdd` to map the behavior flowchart from the user or caller perspective. Prioritize `e2e` over `integration` over `unit` with human-verifiable outputs. If tests are flat or duplicate converged branches, propose a `[M/A/D/R]` BDD tree (`given`, `when`, `then`).
5. For `Documentation`, apply `/difflab-writing-style` and flag walls of text, non-domain terms, or prose replaceable by a diagram or tree. Under `documentation.requirements`, flag `FR` or `NFR` prefixes and internal implementation specifications inside `Requirement` and `Requirements` sections. Require observable behavior and performance, security, cost, isolation, and reliability characteristics from a client or end-user perspective.
6. Fill `REVIEW.md` using `/difflab-writing-style`. Write each finding once under `## Change Requests`, and link it from `## Findings` and section assessments.

## 3. Format findings and comments

- Keep each generated comment to one short sentence in simple English without multi-line prose.
- Use a suggested change block, short code snippet, Mermaid behavior diagram, or `[M/A/D/R]` BDD test tree when illustrating a fix.
- Start recommendations with "I suggest" or "I recommend". Unless an active flow contract forbids AI attribution, end each generated comment with `> Generated via <actual model name>`.

## 4. Publish or finish locally

In `--local` mode, write findings only to `REVIEW.md` and `rubric.yaml`. Do not commit, push, or call a forge in `--local` mode. For remote review, follow these steps:

1. Make sure that `gh` or `glab` authentication works, and run format, lint, and test tasks on the intended changes.
2. If uncommitted source changes exist, commit and push only intended repository files and never stage `.difflab` store artifacts.
3. Reuse an open PR for the branch, or open a draft PR using `pull-request-description` per [the PR draft workflow](../../../pr/references/workflows/draft.md#description-contract).
4. Anchor each finding to changed lines in the pushed PR diff. Submit inline comments in one `COMMENT` review with an empty overall body, and never approve or merge.
5. Report `REVIEW.md`, `rubric.yaml`, commit SHA, PR URL, findings, and validation results.
