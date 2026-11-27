# Repository Guidance

## Hard Rules

- Use the app's task runner. Run project tasks through its `mise.toml`; see the root `mise.toml` for workspace tasks.
- Use Premise to scaffold and manage this monorepo. See `premise.yaml` for project templates and providers.

## Organization

### Repository layout

- Put reusable filesystem, network, process, OS, and other generic utilities in `src/extensions` or `libs/utils`. Reserve `*x` module names (`fsx`, `gitx`, `logx`, `netx`, `osx`, `pathx`, `processx`, `testx`, `zodx`) strictly for extensions—composite wrapper functions built on top of libraries, runtimes, or CLIs; name plain shared types and contract helpers without the `x` suffix (such as `utils/dto` and `utils/model`).
- Put persistence abstractions in `src/stores`. Keep store-specific error classes in the store's module.
- Define application-level exceptions in `src/errors.ts` and module-specific exceptions in their module. Throw standard JavaScript error types (`Error`, `TypeError`, `RangeError`) from generic `libs/utils` modules rather than defining custom exception subclasses there.
- Put general package-wide types in `src/types.ts` rather than mixing non-database types into database schema modules.
- Colocate module-scoped types alongside their functions instead of creating separate `types.ts` files.
- Put Protobuf contract mappers in `src/dtos/` using `*DTO` objects that group `schema`, `toProto`, and `fromProto` (from `utils/dto`).
- Keep one major model, entity, or DTO per file.
- Add an architecture document under `docs/architecture/<package>/index.md` for every new library or application following the `software-architecture-design` template and Difflab writing style.
- Use `loglayer` (`@loglayer/transport-logtape`) via `configureAppLogger` / `createAppLogger` in `libs/utils/src/logx.ts` for structured wide-event application logging, and minimal `@logtape/logtape` loggers via `createLibLogger` in libraries without configuring sinks.
- [Proposed] Keep package `src/index.ts` entry points limited to re-exports and put implementation in dedicated modules.
- [Proposed] Name code generation tasks `codegen` and `codegen:check` consistently with `format` and `format:check`.
- [Proposed] Avoid bespoke CLI scripts for maintenance tasks (such as database migrations) when a `mise` task suffices.

### TypeScript files

- After imports, group code under Constants, Types, API, and Helpers, in that order, when they apply.
- Put module-scoped error classes in Types.
- Declare explicit named types (for example `type DifflabEnv = z.infer<typeof difflabEnvSchema>`) in Types rather than using inline `z.infer<...>` in function signatures.

### Test files

- Group code under Setup, Tests, Cleanup, and Helpers, in that order, when they apply.
- Put setup hooks in Setup, cleanup hooks in Cleanup, and file-only helpers last in Helpers.

## Style

### Markdown

- Use soft wraps for Markdown prose. Keep each paragraph on one source line and let the editor wrap it for display.
- Keep line breaks that define code blocks, diagrams, file trees, tables, lists, and other Markdown structure.
- [Proposed] Keep skill and agent instructions imperative, terse, and instructional; do not write them as historical logs.
- [Proposed] Keep `SKILL.md` files brusque and focused on argument resolution, safety boundaries, and routing to `references/workflows/`; put step-by-step execution in `references/workflows/` and non-workflow reference specifications in `references/`.
- [Proposed] Write skill and workflow files in terse Simple English without Mermaid diagrams; reserve Mermaid diagrams for documentation, plans, and reviews.

### TypeScript

- Keep module APIs thin. Expose only the operations callers need.
- Document every public class, function, type, and exported object with a concise JSDoc docstring.
- Make section divider comments 80 columns wide, using `//`, the section name, and trailing hyphens. Use the same format in test files.
- Use semantic exceptions for failures that callers need to catch and handle.
- [Proposed] Name each package's base error class after the package (for example `DifflabConfigError`, `DifflabClientError`, `DifflabDbError`) and derive package-specific errors from it.
- [Proposed] Prefer class-based APIs with static factories such as `withOptions(...)` or `open(...)` over large sets of standalone module functions, and keep transport clients decoupled from daemon or process lifecycle.
- Define persisted domain models with Zod schemas and `defineModel(...)` (`utils/model`) so Kysely owns table row types directly (via `CamelCasePlugin`) without row-to-entity translation layers; keep wire-to-model mapping exclusively in DTOs. Prefer domain names such as `git-remotes` over `repositories` to avoid confusion with data-access repositories.

## Testing

- Colocate unit tests in `.test.ts` files and integration tests in `.spec.ts` files.
- Treat local CLI and stdio protocol tests as integration tests. Keep them beside the feature they exercise.
- Put tests that depend on external services in an `e2e` directory outside application and library source trees.
- Keep each test readable with separate Arrange, Act, and Assert steps.
- Put generic shared test utilities in `src/extensions`.
- Do not test the structure of static assets or templates, the test apparatus itself, or write regression tests for changes introduced within the same changeset or for alpha projects without users.
- [Proposed] Prefer outside-in testing (`e2e` > `integration` > `unit`) over verbose AI-generated unit tests.
- [Proposed] Organize tests in BDD/Gherkin style with nested `given`/`when`/`then` or `it` clauses so coverage is easy to read.
- [Proposed] Prefer human-verifiable test outputs for end-to-end and integration tests, such as snapshots, test logs, or JSON request/response outputs.
