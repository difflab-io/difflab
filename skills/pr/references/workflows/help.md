# PR/MR workflow guide

Describe these natural-language actions when asked for help or when the intent is unclear. An optional PR/MR identifier or URL selects a target; otherwise use a unique open request on the current branch. Ask if several requests or repositories match. These are skill intents, not new executable commands.

| Action                    | Result                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Draft or open             | Create a draft PR/MR, empty description by default; supplied body is used verbatim.                                            |
| Publish or ready          | Change a draft PR/MR to ready; leave pending comments alone.                                                                   |
| Approve                   | Submit the current user's pending inline comments with approval.                                                               |
| Reject or request changes | Submit the current user's pending comments with a supported native change-request state; stop when unavailable.                |
| Comment                   | Publish the current user's pending comments without approval or rejection.                                                     |
| Review                    | Assess the diff locally by default; explicitly requested draft inline feedback remains pending.                                |
| Address                   | Evaluate and fix authorized review requests; resolve only confirmed completed threads when requested.                          |
| Update                    | Edit an identified description or local review artifact without implicit publication.                                          |
| Merge or land             | Confirm merge, then watch post-merge CI for the actual base SHA. `--autofix` permits at most five safe, authorized fix rounds. |

`publish` does not publish review drafts. To tidy branch commits, use the git skill's squash workflow. For scaffolded `REVIEW.md`, use [Difflab review](../../../difflab-review/SKILL.md). See [provider selection](../providers.md) for GitHub, GitLab, and other forges. Report unsupported operations instead of replacing them with a different state.
