# Draft a PR or MR

Resolve an explicit source branch or the current branch, target repository, and requested base. Otherwise discover the repository's default branch; do not assume it is main. Confirm that the branch is not detached and that the selected head and base differ. Route new/create/open/draft requests here. Derive a concise title from the actual change. Fill the installed Difflab template using the description contract below.

Look for an existing open PR/MR with the same head repository and branch and target base. If one exists, return its URL and state without creating another. If a different-base request exists, ask whether the user intended to use it or change its target; never create a duplicate silently. Check the remote head is pushed, differs from the base, and has a comparison the forge can use. If it is local-only, identical, or the forge rejects a draft, report what is missing and ask before any push or new commit. Never manufacture an empty diff or unrelated change to permit creation.

## Description contract

Every `pr new`, `pr create`, `pr open`, or `pr draft` execution MUST use the Difflab `pull-request-description` template (`~/.difflab/templates/pull-request-description.md`) for the PR/MR body. Never create a PR/MR with an empty description or without `--body-file`. Follow the template structure and preserve custom sections. Read the actual branch diff, relevant plan or issue, and executed check results before filling it. Do not infer passing checks from commits or invent issue links. State checks that did not run, no further work, or no linked issue when applicable.

1. Scaffold the template first: call `scaffold({name:"pull-request-description",cwd:<absolute checkout root>,path:<distinct local draft directory>,filename:"PR-DRAFT.md"})` (or `difflab templates scaffold pull-request-description <draft-dir> PR-DRAFT.md --cwd <absolute checkout root>`). If scaffolding is unavailable, copy `~/.difflab/templates/pull-request-description.md` (or `apps/difflab-cli/templates/pull-request-description.md`) to a new local draft file without overwriting any existing file.
2. Fill every placeholder (`{{intent}}`, `{{changes}}`, `{{validation}}`, `{{further_work}}`, `{{issue_url}}`, plus any custom sections) using [difflab-writing-style](../../../difflab-writing-style/SKILL.md).
3. Verify the draft file on disk before calling the forge CLI: confirm that every section heading is followed by concrete content and no `{{...}}` placeholder or empty section remains. Stop if the template is missing or any section is blank.

## Create and read back

Create a draft through the selected [provider](../providers/index.md) with the exact filled body. Use a structured body argument or a file, such as `gh pr create --draft --body-file <draft-path>`. Never interpolate multiline prose into shell code. Do not attach an assignee or change the branch unless requested.

Read the created PR/MR description back from the forge and compare it with the intended text. Report any mismatch as partial success with the URL; do not create a second request. Report the title, head/base, and installed template used. If creation fails, report the forge's constraint. Preserve the branch and working copy. Reusing an existing PR does not authorize rewriting its body; use the update workflow for a requested description change.
