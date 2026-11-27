# Authentication: software architecture

## Overview

`apps/difflab-web` authenticates browser users and remote CLI clients through a thin `AuthProvider` boundary under `apps/difflab-web/src/lib/server/auth/` and Better Auth's native SvelteKit integration (`svelteKitHandler` + `createAuthClient`). It supports three modes: loopback bypass for local `difflab ui` sessions, static bearer token authentication for remote CLI calls, and generic OpenID Connect (OIDC) powered by Better Auth in **stateless JWE cookie mode**. Running Better Auth without a database avoids coupling application auth to PostgreSQL schema migrations while delegating OIDC discovery, PKCE (S256), JWKS ID-token verification, `/api/auth/*` routing, and encrypted `HttpOnly` session cookies directly to Better Auth.

## Requirement

### Functional

- Local `difflab ui` sessions on loopback (`127.0.0.1`, `localhost`, `::1`) work without accounts, cookies, or tokens.
- Hosted and self-hosted deployments authenticate browser users against any standard OIDC provider via `.well-known/openid-configuration` discovery without vendor-specific SDKs in this repository.
- Remote CLI clients authenticate with `Authorization: Bearer <token>` and `x-difflab-workspace` alongside OIDC browser sessions.
- External OIDC providers register Better Auth's native callback path `/api/auth/callback/oidc` across local Docker, preview deployments, and production.

### Non-Functional

- Authentication must not require Better Auth to own or migrate tables in the application database (`libs/difflab-db` remains the sole database schema owner).
- Browser sessions must survive serverless cold starts and horizontal scaling with a deterministic user identifier across instances.
- Session and OAuth state cookies must stay well under the 4 KB browser cookie limit and carry `HttpOnly` and `SameSite=Lax` flags (`Secure` on HTTPS).

## Design

### Components and Responsibilities

```mermaid
flowchart TD
  Req["Incoming HTTP Request"] --> Hook["hooks.server.ts (svelteKitHandler)"]
  Hook --> Provider["createAuthProvider (provider.ts)"]
  Provider -->|"authProvider = local"| Local["Loopback Provider (127.0.0.1 / localhost)"]
  Provider -->|"authProvider = token"| Token["Bearer Token Provider (constant-time compare)"]
  Provider -->|"authProvider = oidc"| Oidc["Better Auth Stateless Provider (oidc.ts)"]
  Oidc -->|"Bearer header present"| Token
  Oidc -->|"No Bearer header"| BA["betterAuth (no DB, JWE cookieCache)"]
  Hook -->|"/api/auth/*"| BA
  BA -->|"genericOAuth (discoveryUrl + PKCE + JWKS)"| IdP["External OIDC Provider (Dex, Kinde, etc.)"]
```

- `apps/difflab-web/src/hooks.server.ts` resolves `event.locals.session` via `runtime.authProvider` and delegates `/api/auth/*` requests directly to Better Auth via `svelteKitHandler`.
- `apps/difflab-web/src/lib/server/auth/provider.ts` selects `local`, `token`, or `oidc` from `DifflabConfig` and checks CLI bearer tokens ahead of browser cookies in `oidc` mode.
- `apps/difflab-web/src/lib/server/auth/oidc.ts` instantiates `betterAuth` (`genericOAuth` plugin, stateless JWE cookies) and maps `auth.api.getSession` into `AuthenticatedSession`.
- `apps/difflab-web/src/lib/auth-client.ts` exposes `createAuthClient()` from `better-auth/svelte` for browser sign-in (`POST /api/auth/sign-in/social`) and sign-out (`POST /api/auth/sign-out`).

### Data and Control Flow

```mermaid
sequenceDiagram
  participant Browser
  participant Hook as "hooks.server.ts (svelteKitHandler)"
  participant BA as "Better Auth (stateless)"
  participant IdP as "OIDC Provider"

  Browser->>Hook: POST /api/auth/sign-in/social (provider = "oidc")
  Hook->>BA: auth.handler(request)
  BA-->>Browser: authorize URL (PKCE S256 + state + nonce) + Set-Cookie (better-auth.oauth_state)

  Browser->>IdP: Authenticate user
  IdP-->>Browser: 302 /api/auth/callback/oidc?code=...&state=...

  Browser->>Hook: GET /api/auth/callback/oidc?code=...&state=... (+ oauth_state cookie)
  Hook->>BA: auth.handler(request)
  BA->>IdP: Exchange code + PKCE verifier, verify ID token via JWKS + nonce
  BA->>BA: mapProfileToUser sets user.oidcSub = claims.sub, seals JWE cookie
  BA-->>Browser: 302 / + Set-Cookie (better-auth.session_data, HttpOnly JWE)

  Browser->>Hook: Subsequent request (+ better-auth.session_data cookie)
  Hook->>BA: auth.api.getSession(headers)
  BA-->>Hook: session.user (decrypted from JWE cookie, zero DB queries)
  Hook->>Hook: AuthenticatedSession.userId = user.oidcSub || user.id
```

## Implementation

### Better Auth Stateless Configuration

`createBetterAuth` in `apps/difflab-web/src/lib/server/auth/oidc.ts` configures a single Better Auth instance with no `database` adapter:

- `basePath: '/api/auth'` mounts Better Auth's native SvelteKit endpoints (`/api/auth/sign-in/social`, `/api/auth/callback/oidc`, `/api/auth/sign-out`, `/api/auth/get-session`) without custom `+server.ts` files.
- `baseURL` is omitted so `svelteKitHandler` derives the request origin dynamically per host, and `trustedOrigins` honors `X-Forwarded-Proto` and `X-Forwarded-Host` for ephemeral preview URLs.
- `session.cookieCache`: `{ enabled: true, maxAge: 604800, strategy: 'jwe', refreshCache: true }` stores the session payload in an encrypted `HttpOnly` JWE cookie (`better-auth.session_data`).
- `account.storeStateStrategy: 'cookie'` stores PKCE and CSRF state in an encrypted cookie (`better-auth.oauth_state`) instead of a database table.
- `account.storeAccountCookie: false` prevents Better Auth from serializing raw provider access and ID tokens into browser cookies.
- `plugins: [genericOAuth(...)]` discovers endpoints from `${OIDC_ISSUER_URL}/.well-known/openid-configuration` and enforces `pkce: true` and `requireIdTokenVerification: true` (JWKS + `nonce`).

### Key Restrictions and Invariants

1. **Key user identity off OIDC `sub`, never Better Auth's ephemeral `user.id`:** Without a database, Better Auth generates a new random internal `user.id` on every sign-in. Difflab copies the verified OIDC `sub` claim into `user.additionalFields.oidcSub` inside `mapProfileToUser` and resolves `AuthenticatedSession.userId = oidcSub || session.user.id`. All application logic and database records must use `AuthenticatedSession.userId` (the stable OIDC `sub`).
2. **Do not enable `storeAccountCookie: true` without auditing cookie size:** Raw OIDC access and ID tokens from providers like Kinde or Auth0 can exceed the 4 KB browser cookie limit when encrypted into cookies. Because `storeAccountCookie` is `false`, server code cannot call Better Auth's `getAccessToken()` to invoke external IdP APIs on behalf of the user.
3. **Share `SESSION_SECRET` across all replicas and serverless functions:** Every instance must use the exact same `SESSION_SECRET` (at least 32 bytes) to decrypt `better-auth.session_data` and `better-auth.oauth_state`. Rotating `SESSION_SECRET` immediately invalidates all active browser sessions.
4. **No per-session server-side revocation:** Stateless JWE cookies remain valid until their 7-day `Max-Age` expires or the user calls `POST /api/auth/sign-out` (which clears the cookies with `Max-Age=0`). If immediate per-user revocation or server-side session listing is required later, migrate to a database-backed session store.
5. **Register `/api/auth/callback/oidc` in external OIDC providers:** Because `svelteKitHandler` serves Better Auth's native callback route directly, external IdPs (Dex, Kinde, etc.) must register `<origin>/api/auth/callback/oidc`.

## References

- System architecture overview: [../index.md](../index.md)
- Deployment architecture (Vercel, self-hosted, and local): [../deployment.md](../deployment.md)
- Configuration architecture and OIDC environment variables: [../difflab-config/index.md](../difflab-config/index.md)
- Environment variables reference: [../../environment.md](../../environment.md)
