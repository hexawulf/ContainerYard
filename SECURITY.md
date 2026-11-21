# Security Policy

## Reporting a Vulnerability

If you discover a security issue in ContainerYard, please email **dev@0xwulf.dev** rather than opening a public GitHub issue. Include steps to reproduce and affected versions.

## Security Architecture

### Authentication & Sessions
- **Password login (break-glass):** Passwords are hashed with `bcrypt` (cost 12), capped at 1,024 characters on login and 12–72 UTF-8 bytes on creation/change, and compared with a dummy hash when an email is unknown.
- **Optional Google sign-in via Firebase Auth:**
  - Server-side ID token verification uses `firebase-admin` with `checkRevoked: true`.
  - Tokens must have `email_verified === true` and `firebase.sign_in_provider === "google.com"`.
  - Access requires **both** membership in `FIREBASE_ALLOWED_EMAILS` **and** an existing `User` row in the ContainerYard database (no automatic user creation; roles always come from the DB).
  - Every authenticated request (`requireAuth`) and live SSE heartbeat (`isSseSessionValid`) re-checks `FIREBASE_ENABLED` and `FIREBASE_ALLOWED_EMAILS` for Google sessions, immediately revoking sessions and closing streams if an account is removed.
  - Service-account JSON keys are mounted read-only from a `0600` host file (`deploy/firebase/docker-compose.firebase.yml`) and never logged or baked into images.
  - Misconfigured Firebase settings degrade cleanly to disabled at startup so break-glass password login continues working.
- **Session management:** Redis-backed `express-session` with `HttpOnly`, `Secure` (`__Secure-cy.sid`), and `SameSite` cookies. Sessions regenerate on login and password change, rotating the synchronizer CSRF token. `User.sessionVersion` enforces instant global session revocation on password reset, role change, or deletion.

### Web & Transport Hardening
- **CSRF protection:** Every mutating `/api/*` request validates both `Origin` against `ALLOWED_ORIGINS` and a constant-time synchronizer token (`x-csrf-token`).
- **CSP & COOP:** Helmet enforces a strict production Content-Security-Policy. When Firebase Auth is disabled, `script-src` and `connect-src` allow `'self'` only and COOP stays `same-origin`. When enabled, only the configured `FIREBASE_CLIENT_AUTH_DOMAIN` and Google/Firebase auth origins are added and COOP switches to `same-origin-allow-popups`.
- **Rate limiting:** Login, password change, container actions, and global API routes are rate-limited; SSE log streams are capped per user (`MAX_SSE_STREAMS_PER_USER = 6`).

### Container & Host Access
- **Runtime:** Non-root (`uid 1000`), `read_only: true` root filesystem, `cap_drop: [ALL]`, `no-new-privileges:true`, and no npm/yarn/corepack in the runtime image.
- **Docker socket & remote agents:** Container IDs are validated against `CONTAINER_REF` before touching the Docker socket. Remote PiDeck log agents use origin-locked URLs, `redirect: "error"`, strict source-ID validation, a 2 MB body cap, and 3-strike auth backoff without ever forwarding agent tokens or raw bodies to browsers.
- **RBAC:** Container/stack mutations, `docker inspect`, Host Logs, log downloads, and User Administration are `ADMIN`-only; `VIEWER` accounts receive redacted (`[hidden]`) container environment values.
- **Webhooks:** Alert webhooks enforce SSRF protection, blocking link-local/metadata addresses and refusing redirects.
