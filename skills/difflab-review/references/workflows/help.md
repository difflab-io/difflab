# Review help

Review requests use natural language and run in a single agent without subagents or background workers.

- `review new` / “review this”: scaffold `REVIEW.md` and `rubric.yaml` in `.difflab/reviews/YYMMDD-{slug}`, inspect all changed files against the [review rubric](../rubric.md), run checks, commit and push intended changes, open or reuse a draft PR, and publish verified inline comments.
- `review new --local`: write `REVIEW.md` and `rubric.yaml` locally without committing, pushing, or calling a forge.
- `review new --adversarial [focus]`: enable all optional rubric sections (including Security) and challenge every dimension for material defects.
- `review address [--local]`: capture qualifying user rules in `AGENTS.md`, apply verified fixes, run checks, and update `REVIEW.md` locally or push and reply/resolve eligible PR threads remotely.

Reviews apply [difflab-writing-style](../../../difflab-writing-style/SKILL.md) (one-sentence plain-English comments, diagrams, and code suggestions instead of walls of text) and [difflab-bdd](../../../difflab-bdd/SKILL.md) (evaluating tests against behavior flowcharts and proposing `[M/A/D/R]` BDD test tree reorganizations when needed).
