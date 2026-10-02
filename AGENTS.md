# Repository Guidance

## Helpers

- Keep helpers used only by one test file in that test file, at the bottom,
  below this 80-column divider:

  `// Helpers ---------------------------------------------------------------------`
- Put generic filesystem, OS, process, and path helpers in `src/extensions`,
  with domain-neutral names such as `fsx`, `osx`, `processx`, and `pathx`.
- Put persistence abstractions such as `JsonFileStore` in `src/stores`; keep
  store-specific error classes in the same module as their store.
