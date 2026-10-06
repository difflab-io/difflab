# Local exclude

Manage only local Git exclude patterns; do not alter the tracked `.gitignore`. Ask for a path or pattern to add or remove, or list the existing entries when requested. Resolve Git's actual exclude file through repository metadata rather than assuming `.git` is a directory: linked worktrees commonly use a `.git` file and may share a common exclude file. Show the intended file and exact pattern before editing, especially when the pattern could hide more than the requested path.

When adding, leave an identical entry alone. When removing, delete only the exact entry the user identified; preserve comments and all unrelated patterns. Do not remove the file or any disk content that matches the pattern. An exclude entry does not untrack an already tracked file and is not a safe substitute for cleaning leaked secrets from history. Verify and report whether the entry exists afterward, whether the file is tracked, and the scope of the effect across worktrees.

This guidance uses Git's existing local exclude behavior. It does not add a command or automation.
