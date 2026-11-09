# Header Actions & User Management Plan

## Goal
Populate the top-right header action row in `Navbar` across all pages in this exact left-to-right order:
`[Open Dashboard (only off /dashboard)] · (i) About · Theme · Change password · Users (ADMIN only) · Logout (always last)`

Move external attribution/repo/docs links out of `Footer` into the `About` modal, move `Logout` out of the `Dashboard` page header into `Navbar`, and add full server-side session revocation (`sessionVersion`), self-service password change, and ADMIN user management with audit logging.

---

## 1. Server & Database (`server/`)

1. **Prisma Schema (`server/prisma/schema.prisma`)**
   - Add `sessionVersion Int @default(0)` to `User`.
   - Push to worktree test DB copy (`npm run db:push:prisma`) and regenerate Prisma client.

2. **Session Revocation & Role Refresh (`server/src/middleware/auth.ts`, `server/src/routes/auth.ts`)**
   - Store `sessionVersion` on `req.session.user` at login.
   - Update `requireAuth` and `requireRole` to query Prisma by `req.session.user.id` on each request:
     - Return `503` if Prisma is unavailable.
     - Destroy session and return `401` if the user no longer exists or `sessionVersion` does not match.
     - Refresh `req.session.user.role` and `req.session.user.email` from the database so role demotions/promotions take effect immediately.
   - Apply `requireAuth` to `GET /api/auth/me`.

3. **Pure Policy & Guard Helpers (`server/src/lib/userPolicy.ts`)**
   - `validateNewPassword(newPassword, currentPassword?)`: enforces `>= 12` characters, `<= 72` UTF-8 bytes (`Buffer.byteLength`), and inequality with `currentPassword`.
   - `evaluateUserMutationGuard({ actorId, targetId, targetCurrentRole, action, newRole, adminCount })`: enforces `403` on self-delete or self-demote, and `409` when deleting or demoting the last remaining `ADMIN`.

4. **Password Change Endpoint (`POST /api/auth/change-password`)**
   - Protected by `requireAuth`, CSRF middleware, and rate limiting.
   - Verifies `currentPassword` with `bcrypt.compare` (`401` on mismatch), validates `newPassword` (`400` on violation), hashes with `bcrypt` cost 12, increments `sessionVersion`, regenerates the caller's session with the new `sessionVersion` (keeping caller signed in while revoking other sessions), and writes `auth.password_change` to `AuditLog`.

5. **Admin Users API (`server/src/routes/users.ts`, mounted at `/api/users`)**
   - Protected by `requireAuth` + `requireRole("ADMIN")` and CSRF middleware.
   - `GET /api/users` → list `[{ id, email, role, createdAt, updatedAt }]` (never returns password hashes or `totpSecret`).
   - `POST /api/users` → create user (`201`, `409` on duplicate email), audited as `user.create`.
   - `PATCH /api/users/:id` → change role (`200`, bumps `sessionVersion` when role changes; `403` self-demote; `409` last admin), audited as `user.role_change`.
   - `POST /api/users/:id/reset-password` → set new password (`200`, bumps `sessionVersion`), audited as `user.password_reset`.
   - `DELETE /api/users/:id` → delete user's `LogBookmark` + `SavedSearch` rows and the `User` row in one `prisma.$transaction` (`200`; `403` self-delete; `409` last admin), audited as `user.delete`.

6. **Build Metadata (`vite.config.ts`)**
   - Inject `__APP_VERSION__` (from `package.json`) and `__BUILD_DATE__` (ISO date) at build time.

---

## 2. Client (`client/src/`)

1. **Header Action Row (`Navbar.tsx`, `components/header/*`)**
   - Unified icon-button styling matching `ThemeToggle` (`h-9 w-9`, rounded border, focus-visible ring, Tooltip, `aria-label`).
   - Buttons and test IDs in exact order:
     1. `Open Dashboard` (only when `location !== "/dashboard"`; icon-only below `sm`)
     2. `AboutModal` (`data-testid="button-about"`, `Info` icon)
     3. `ThemeToggle` (`data-testid="button-theme-toggle"`, `Sun`/`Moon` icon)
     4. `ChangePasswordModal` (`data-testid="button-change-password"`, `KeyRound` icon, authenticated only)
     5. `UsersModal` (`data-testid="button-users"`, `Users` icon, `ADMIN` only)
     6. `LogoutButton` (`data-testid="button-logout"`, `LogOut` icon, authenticated only, always last)
   - Hide the `"ContainerYard"` wordmark text below `sm` so `360px` viewports have zero horizontal overflow.

2. **Modals**
   - `AboutModal`: Logo, tagline, version + build date, runtime user/role when signed in, grouped tech stack (Frontend, Backend, Data & Auth, Tooling), developer contact (`0xWulf`, `mailto:dev@0xwulf.dev`, `https://github.com/hexawulf`), project links (repo, README docs, issues, website, MIT license), and copyable diagnostics line with toast.
   - `ChangePasswordModal`: current/new/confirm password inputs with show/hide toggles, client-side validation (12 chars, 72 UTF-8 bytes, confirm match, differs from current), inline server error display, loading state, and success toast.
   - `UsersModal`: table of users (email with `(you)` badge, role badge, created date, role `Select`, reset-password dialog with generator + copy, delete `AlertDialog` confirming the user's email) and an "Add user" form with password generator + copy, inline error banner, and TanStack Query invalidation.

3. **Dashboard & Footer Cleanup**
   - Remove `Logout` button and redundant role `Badge` from `Dashboard.tsx` header (role is indicated by the ADMIN-only Users button in the header and shown in the About modal Runtime section). Keep `Host Logs` button in `Dashboard.tsx`.
   - Remove `hexawulf` and `GitHub` / `Docs` links from `Footer.tsx` (and hero duplicate links from `Landing.tsx`), keeping `Logo`, copyright + version line, and `Style Guide` link in `Footer.tsx`.

---

## 3. Testing & Verification

1. **Unit Tests (`server/tests/unit/user-policy.test.ts`)**: test password validation (length, 72-byte UTF-8 multibyte limit, must differ) and self/last-admin guards.
2. **Integration Tests (`server/tests/integration/api.test.ts`)**: test viewer creation, viewer 403 on `/api/users`, viewer password change + session revocation across two cookie jars, admin role promotion/demotion + password reset, self-protection and last-admin guards, cascade deletion, and `/api/audit` entries.
3. **Playwright E2E (`e2e/header-actions.spec.ts`)**: verify logged-out, VIEWER, and ADMIN header button order, About modal contents, Footer link removal, Change Password modal, Users modal, Logout flow, and zero horizontal overflow at `1440x900` and `375x812` in light and dark modes, plus screenshots in `docs/screenshots/header-actions/`.
