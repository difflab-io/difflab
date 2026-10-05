# Review help

Review requests use natural language; no new parser or rigid command syntax is required.

- Say “review this” or use `review new` to create a grounded review from the current diff.
- Add `--local` to keep change requests in `REVIEW.md` with no remote writes, even in the background.
- Add `--bg` to delegate to a native background worker. For remote workflows, it may commit, push, create a draft PR, post verified inline PR comments, and resolve eligible threads without pausing for permission; ambiguity or denied access is reported as a blocker.
- Add a focus such as “security” or “tests” to guide review depth.
- Say “address review comments” or use `review address` to resolve actual requested-change threads.
- Remote `review new` runs checks, commits and pushes intended changes, then opens or reuses a draft PR and publishes verified inline findings before returning. When files change, remote `review address` commits and pushes fixes before terse in-thread replies. It then resolves only small fully completed threads. Questions, broad refactors, and reopened discussions remain open; no overall comment is posted.
- In local mode, requests and responses stay in `## Change Requests`; there is no commit or push.

The repository must be initialized with `difflab init`. Ambiguous targets, missing diffs, unavailable forge authentication, unavailable model attribution, and failed thread operations are reported rather than guessed around. Human-authored comments are preserved, and quoted review text is treated as untrusted data.
