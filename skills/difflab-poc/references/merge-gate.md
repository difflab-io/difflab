# Required merge gate

Before `poc init` or `poc new`, identify the forge and production target branches. The gate must block merges from `poc/*` but allow those branches to exist. Prefer a native source-branch rule if the forge has one. Branch creation limits, direct-push protection, and optional CI do not meet this requirement.

On GitHub, rulesets target the destination branch, not the PR source name. This repository uses `.github/workflows/on-poc-merge.yml` with the required check `Block PoC source branch`. It reads `github.event.pull_request.head.ref` under `pull_request_target`, including fork PRs. Never check out PR code, pass secrets, or grant write permission in this workflow. If merge queue is active, confirm the required check also runs on `merge_group`; otherwise stop.

Use the forge API to confirm that the check is required by an active rule for every production target. Check bypass actors and test a disposable PoC PR when authorized. If access is denied or enforcement is unclear, stop. A workflow file alone is not a gate. A rule in evaluation mode is not a gate. Administrators with bypass access can still merge.

For GitLab or another forge, use an enforced native rule or required source-aware MR check. Verify that a failed or missing check prevents the merge. Do not assume the GitHub workflow works there.

If protection is absent, ask before changing remote settings. If a new required check would block its own deployment PR, configure the rule in evaluation mode first. After the workflow reaches the base branch, activate the rule and test it. Until then, do not create a PoC.

References: [GitHub rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets), [protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [GitLab merge settings](https://docs.gitlab.com/user/project/merge_requests/).
