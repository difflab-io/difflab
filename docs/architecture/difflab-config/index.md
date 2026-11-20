# Difflab Config: software architecture

## Overview

`libs/difflab-config` is Difflab's shared configuration and path resolution library. It validates environment variables, state directory layouts, TCP port values, project keys, and repository-local `difflab.yaml` manifests in one place for `difflab-cli`, `difflab-api`, and `difflab-db`. Remote secret stores and interactive configuration prompts are out of scope.

## Requirement

### Functional

- Callers load typed runtime settings from environment variables and receive all validation failures together in one error rather than failing on one field at a time.
- Callers resolve consistent local state paths (database, legacy database, templates, and project stores) from an explicit directory, a user home directory, or default user state.
- Callers read and atomically create repository-local `difflab.yaml` files while rejecting malformed YAML, unknown keys, or non-canonical project keys before any database lookup.

### Non-Functional

- All configuration validation failures raise a predictable package-scoped exception hierarchy so callers can distinguish missing manifests from invalid configuration.
- Creating a repository manifest fails cleanly without overwriting an existing file when concurrent initializers race.

## Design

### Components and Responsibilities

```mermaid
flowchart LR
  Callers["difflab-cli / difflab-api / difflab-db"] --> Config["DifflabConfig<br/>(src/config.ts)"]
  Config --> EnvSchema["difflabEnvSchema<br/>(Zod bulk validation)"]
  Config --> RepoSchema["repoConfigSchema<br/>(difflab.yaml)"]
  Config --> ZodX["libs/utils/zodx<br/>(tryValidate)"]
  Config --> Errors["DifflabConfigError hierarchy<br/>(src/errors.ts)"]
```

- `src/config.ts` defines `loadDifflabConfig`, `resolveDifflabPaths`, `readRepoConfig`, `writeRepoConfig`, `validateProjectKey`, `difflabEnvSchema`, `repoConfigSchema`, `projectKeySchema`, and all colocated configuration types.
- `src/errors.ts` defines `DifflabConfigError` as the base exception class with `MissingRepoConfig` and `InvalidRepoConfig` subclasses.
- `src/index.ts` re-exports the public API without implementation code.

### Data and Control Flow

1. `loadDifflabConfig({ home, root, env })` parses `env` through `difflabEnvSchema` using `tryValidate` from `libs/utils/zodx`, collecting every schema issue into one `DifflabConfigError`.
2. Root resolution applies precedence `explicit root` -> `home/.difflab` -> `DIFFLAB_HOME` -> `~/.difflab` and derives every child path deterministically.
3. `readRepoConfig(dir)` loads `difflab.yaml` via `c12` (`loadConfig`) and validates it against `repoConfigSchema` (`z.strictObject`), returning `null` when absent.

### Interfaces and Contracts

```ts
export type DifflabConfig = {
  readonly mode: ApiMode
  readonly paths: DifflabPaths
  readonly host: string
  readonly port: number
  readonly databaseUrl?: string
  readonly apiToken?: string
  readonly remote: RemoteRpcConfig | null
}

export function loadDifflabConfig(options?: DifflabConfigLoadOptions): DifflabConfig
export function resolveDifflabPaths(home?: string, env?: NodeJS.ProcessEnv): DifflabPaths
export function validateProjectKey(raw: string): string
export function readRepoConfig(dir: string): Promise<RepoConfig | null>
export function writeRepoConfig(config: RepoConfig, dir: string): Promise<string>
```

## Implementation

### Single-Pass Zod Validation

`difflabEnvSchema` and `repoConfigSchema` share `tryValidate` from `libs/utils/zodx` so both environment configuration and `difflab.yaml` report all invalid keys in one semicolon-separated message without bespoke per-field parsers.

## References

- Environment variable reference: [../../environment.md](../../environment.md)
- API consumer: [../difflab-api/index.md](../difflab-api/index.md)
- Database consumer: [../difflab-db/index.md](../difflab-db/index.md)
