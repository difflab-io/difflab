# Repository Guidance

## TypeScript files

After imports, use these sections in order when they apply:

```ts
// Constants -------------------------------------------------------------------
// Types -----------------------------------------------------------------------
// API -------------------------------------------------------------------------
// Helpers ---------------------------------------------------------------------
```

Keep divider comments 80 columns wide. Organize code in modules with controlled,
thin API surfaces that expose only the operations callers need. Put generic
filesystem, process, OS, and other reusable utilities in `src/extensions`, with
domain-neutral names such as `fsx`, `osx`, `processx`, and `pathx`.

Use semantic exceptions for failure cases that callers need to catch and
handle. Define application-level exceptions in `src/errors.ts` and
module-specific exceptions in the relevant module. In a module, place module-scoped
error classes in the Types section; app-scoped errors remain in `src/errors.ts`.

## Tests

Keep unit tests colocated in `.test.ts` files and integration tests in `.spec.ts` files. A test of the local CLI or stdio protocol is an integration test and can remain beside the feature it exercises. Keep end-to-end tests that depend on external services in a separate `e2e` directory outside the application or library source tree.

Use these sections in order when they apply:

```ts
// Setup -----------------------------------------------------------------------
beforeEach(/* ... */)

// Tests -----------------------------------------------------------------------

// Cleanup ---------------------------------------------------------------------
afterEach(/* ... */)

// Helpers ---------------------------------------------------------------------
```

Keep each test readable with Arrange, Act, and Assert steps. Keep helpers used
only by one test file at the bottom of that file. Put generic test utilities in
`src/extensions` so multiple test files can reuse them.

## Persistence

Put persistence abstractions such as `JsonFileStore` in `src/stores`; keep
store-specific error classes in the same module as their store.
