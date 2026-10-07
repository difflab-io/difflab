# `explore new`

Read `../research-standards.md`. Do not write application code.

1. Confirm the repository root and `.difflab` project-store link. In `explore new auth: compare authentication libraries`, use `auth` as the name and the rest as the question. With `explore new auth`, keep the name and ask for the question before scaffolding. A multiword request without a `name:` separator is the question. If no name is given, derive a safe lowercase slug from it. If the path exists, ask whether to update it or choose another name. Reject symlinks and paths outside `.difflab/explore/`.
2. Ask whether to write proposals only if the request leaves that choice open. Split research by independent questions. If the topic concerns this repository, inspect its relevant code. Do not scan the codebase for general research. Fetch primary sources for each external claim and verify delegated work.
3. Use MCP `scaffold` for `.difflab/explore/<slug>/SUMMARY.md` (`exploration-summary`) and `research/<angle>.md` (`exploration-research`). Use an absolute repository `cwd` and a relative directory `path`. Add `proposals/<approach>.md` (`exploration-proposal`) only when requested. Never overwrite a file. Fill the templates after research; mark any unfinished output as incomplete.
4. Link verified notes from the summary. Compare distinct options without forcing a recommendation. Proposals need evidence and honest trade-offs, not implementation tasks.
5. Make sure that every source link supports its claim, no placeholder remains, and every file stays in the exploration directory. Report files, unknowns, and failed source checks. Do not commit.

Example: `explore new whether an embedded search index fits our CLI` creates an inferred slug. `explore new search-index: compare embedded indexes` uses `search-index`.
