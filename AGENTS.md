# Repository Guidance

## Hard Rules

- Use the app's task runner. Run project tasks through its `mise.toml`; see the root `mise.toml` for workspace tasks.
- Use Premise to scaffold and manage this monorepo. See `premise.yaml` for project templates and providers.

## Organization

### Repository layout

- Put reusable filesystem, process, OS, and other generic utilities in `src/extensions`. Use domain-neutral names such as `fsx`, `osx`, `processx`, and `pathx`.
- Put persistence abstractions such as `JsonFileStore` in `src/stores`. Keep store-specific error classes in the store's module.
- Define application-level exceptions in `src/errors.ts` and module-specific exceptions in their module.

### TypeScript files

- After imports, group code under Constants, Types, API, and Helpers, in that order, when they apply.
- Put module-scoped error classes in Types.

### Test files

- Group code under Setup, Tests, Cleanup, and Helpers, in that order, when they apply.
- Put setup hooks in Setup, cleanup hooks in Cleanup, and file-only helpers last in Helpers.

## Style

### Markdown

- Use soft wraps for Markdown prose. Keep each paragraph on one source line and let the editor wrap it for display.
- Keep line breaks that define code blocks, diagrams, file trees, tables, lists, and other Markdown structure.

### TypeScript

- Keep module APIs thin. Expose only the operations callers need.
- Make section divider comments 80 columns wide, using `//`, the section name, and trailing hyphens. Use the same format in test files.
- Use semantic exceptions for failures that callers need to catch and handle.

## Testing

- Colocate unit tests in `.test.ts` files and integration tests in `.spec.ts` files.
- Treat local CLI and stdio protocol tests as integration tests. Keep them beside the feature they exercise.
- Put tests that depend on external services in an `e2e` directory outside application and library source trees.
- Keep each test readable with separate Arrange, Act, and Assert steps.
- Put generic shared test utilities in `src/extensions`.
