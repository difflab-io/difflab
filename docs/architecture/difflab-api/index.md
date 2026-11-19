# Difflab API: software architecture

## Overview

`difflab-api` is Difflab's HTTP RPC server for project and repository metadata. It serves the same Connect JSON-RPC (an HTTP JSON RPC protocol generated from Protocol Buffers) API in two deployment modes: a single-owner local background daemon over SQLite for `difflab-cli` and `stdio` MCP sessions, and a multi-tenant cloud service over PostgreSQL for remote CLI and web clients. Local filesystem workflows (templates, todo lists, progress logs, and `.difflab` symlinks), OAuth token issuance, and background local-to-cloud sync are out of scope.

## Requirement

### Functional

- Clients query a `/health` endpoint to verify server readiness before sending RPC traffic.
- Local callers on loopback invoke RPC methods without credentials and read or write records in the local workspace.
- First-time local startup initializes the local database automatically and imports existing `v0.13.0` projects once without modifying the legacy database file.
- Cloud callers authenticate with a Bearer API token and select a target workspace on every RPC call.
- Invalid request fields return HTTP `400` (`invalid_argument`), missing or invalid Bearer credentials return HTTP `401` (`unauthenticated`), missing cloud workspace headers return HTTP `400` (`invalid_argument`), unknown resources return HTTP `404` (`not_found`), and conflicting keys or repository links return HTTP `409` (`already_exists`).

### Non-Functional

- Startup fails before binding a TCP port if cloud credentials are missing or if an existing database has unapplied schema migrations, preventing partial or unauthenticated traffic.
- Bearer token verification runs in constant time so response latency does not leak token prefixes or length.
- Every RPC call emits a single-line structured JSON log containing the method path, HTTP status, workspace, request body, and response body for operator and E2E inspection.
- Local mode binds to loopback by default and carries zero external infrastructure cost, while cloud mode runs statelessly over pooled PostgreSQL connections.

## Design

### Components and Responsibilities

```mermaid
flowchart LR
  Caller["difflab-cli / Remote Client"] -->|"DifflabClientTarget"| SDK["libs/difflab-client-ts"]
  SDK -->|"POST /rpc/difflab.v1.*"| Hono["Hono HTTP App<br/>(GET /health + /rpc/*)"]
  Hono --> Gate["Auth Request Gate<br/>(Bearer + kActor)"]
  Gate --> Validate["Protovalidate Interceptor<br/>(buf.validate rules)"]
  Validate --> Handlers["Service Implementations<br/>(ProjectService)"]
  Handlers --> DB["libs/difflab-db"]
  Boot["Server Startup"] -->|"first local.sqlite"| Seed["Legacy Seeder<br/>(readonly difflab-db-legacy)"]
  Seed --> DB
```

- `apps/difflab-api/proto/` owns the `.proto` schemas and `buf.validate` field rules, generating server descriptors into `apps/difflab-api/src/gen/` and client descriptors into private `libs/difflab-client-ts/src/gen/`.
- `apps/difflab-api/src/app.ts` mounts `GET /health`, wraps Connect universal fetch handlers at `/rpc/*`, and logs structured JSON request and response transcripts.
- `apps/difflab-api/src/context.ts` enforces cloud Bearer authentication via SHA-256 `timingSafeEqual`, validates `x-difflab-workspace`, and populates the `kActor` Connect context key before request bodies are parsed.
- `apps/difflab-api/src/legacy-seed.ts` opens sibling `difflab.sqlite` read-only through `libs/difflab-db-legacy` when `local.sqlite` is created for the first time.

### Data and Control Flow

```mermaid
sequenceDiagram
  participant Client as difflab-client-ts
  participant App as Hono (/rpc/*)
  participant Gate as Auth Request Gate
  participant Val as Protovalidate
  participant Svc as Service Handler
  participant DB as difflab-db

  Client->>App: POST /rpc/difflab.v1.<Service>/<Method>
  App->>Gate: Check mode, Authorization, x-difflab-workspace
  alt Missing/invalid credentials or workspace
    Gate-->>App: ConnectError (401 or 400)
  else Authorized
    Gate->>Val: Attach ActorContext on kActor
    Val->>Svc: Validated Protobuf request
    Svc->>DB: Execute workspace-scoped query
    DB-->>Svc: Domain entity or semantic error
    Svc-->>App: Protobuf JSON response or mapped ConnectError
  end
  App-->>Client: HTTP JSON response (+ api.log entry)
```

### Interfaces and Contracts

```ts
export type ApiMode = 'local' | 'cloud'

export type AppDeps = {
  db: DifflabDb
  mode: ApiMode
  apiToken?: string
  log?: (entry: Record<string, unknown>) => void
}

export function createApp(deps: AppDeps): Hono
```

| Endpoint / Header | Mode | Contract |
| --- | --- | --- |
| `GET /health` | `local`, `cloud` | Returns `200 OK` with `{ "ok": true, "mode": "<mode>" }`. |
| `POST /rpc/<package>.<Service>/<Method>` | `local`, `cloud` | Connect JSON-RPC unary endpoint. See [projects.md](./projects.md) for `ProjectService` methods. |
| `Authorization: Bearer <token>` | `cloud` | Required; compared against `DIFFLAB_API_TOKEN`. |
| `x-difflab-workspace: <id>` | `cloud` | Required non-empty workspace identifier (`1..64` chars). |

## Implementation

### Code Generation and Private SDK Boundary

`apps/difflab-api/buf.gen.yaml` runs `@bufbuild/protoc-gen-es` twice so server handlers and `libs/difflab-client-ts` stay in lockstep from one `.proto` source. `mise run //apps/difflab-api:lint` runs `check-codegen` to reject stale generated files in CI. `libs/difflab-client-ts` keeps `"private": true` without `publishConfig` and is bundled directly into `@difflab/difflab-cli`.

### Startup Modes and Daemon Metadata

`apps/difflab-api/src/index.ts` selects `cloud` mode when `DIFFLAB_MODE=cloud` or `DATABASE_URL` is set, and `local` mode otherwise. In `local` mode, once `Bun.serve` binds `127.0.0.1:<port>`, the process writes `$DIFFLAB_HOME/daemon.json` atomically via `libs/utils/daemonx` and removes `daemon.json` on `SIGINT` or `SIGTERM`.

## References

- `ProjectService` RPC contracts and error mapping: [projects.md](./projects.md)
- Dual-dialect persistence architecture: [../difflab-db/index.md](../difflab-db/index.md)
- Environment variables and migration workflow: [../../environment.md](../../environment.md) and [../../development.md](../../development.md)
- Connect Protocol specification: <https://connectrpc.com/docs/protocol/>
