# Draft a PR or MR

Resolve an explicit source branch or the current branch, target repository, and requested base. Otherwise discover the repository's default branch; do not assume it is main. Confirm that the branch is not detached and that the selected head and base differ. Route new/create/open/draft requests here. Derive a concise title from the actual change. Fill the installed Difflab template using the description contract below.

Look for an existing open PR/MR with the same head repository and branch and target base. If one exists, return its URL and state without creating another. If a different-base request exists, ask whether the user intended to use it or change its target; never create a duplicate silently. Check the remote head is pushed, differs from the base, and has a comparison the forge can use. If it is local-only, identical, or the forge rejects a draft, report what is missing and ask before any push or new commit. Never manufacture an empty diff or unrelated change to permit creation.

## Description contract

Use the installed `~/.difflab/templates/pull-request-description.md` for every generated PR/MR description. It must include Intent, Changes, Validation, Further Work, and References. Preserve custom sections and user prose. Read the actual branch diff, relevant plan or issue, and executed check results before filling it. Do not infer passing checks from commits or invent issue links. State checks that did not run, no further work, or no linked issue when applicable.

Prefer `scaffold({name:"pull-request-description",cwd:<absolute checkout root>,path:<distinct local draft directory>,filename:"PR-DRAFT.md"})`. Read the result and fill every placeholder without replacing its structure. If scaffolding is unavailable, read the installed file and create a distinct working copy without overwriting any existing file. Do not edit the installed template or silently substitute a bundled or forge default. If the template is missing or unreadable, report the setup issue before creation. Add any missing required sections to an old/custom working copy while preserving its content.

Place supplied factual prose in the relevant sections without changing its meaning. If the user explicitly requests a verbatim body, honor that choice unless repository instructions require the template. Report that conflict before writing. A partial supplied description is not a reason to leave other sections empty.

Before creation, make sure that the body contains actual change details or explicit limits in every required section. Reject unresolved placeholders and empty sections. Keep the prose short and use simple English.

## Create and read back

Create a draft through the selected [provider](../providers/index.md) with the exact filled body. Use a structured body argument or a file, such as `gh pr create --draft --body-file <draft-path>`. Never interpolate multiline prose into shell code. Do not attach an assignee or change the branch unless requested.

Read the created PR/MR description back from the forge and compare it with the intended text. Report any mismatch as partial success with the URL; do not create a second request. Report the title, head/base, and installed template used. If creation fails, report the forge's constraint. Preserve the branch and working copy. Reusing an existing PR does not authorize rewriting its body; use the update workflow for a requested description change.
