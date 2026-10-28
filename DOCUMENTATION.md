# Presspaper technical documentation

## Runtime and data boundary

Presspaper has one runtime mode: `live`. Supabase Auth and Postgres are required, and missing or partial credentials stop production startup and builds. Runtime business data is never sourced from TypeScript fixtures.

`BrowserRouter` handles application navigation. Vercel rewrites normal deep links to `index.html`, while `/r/:id`, `/sitemap.xml`, API paths, and static assets remain reserved.

The frontend is organised as follows:

- `src/auth`: session/profile loading and route authorization
- `src/routes/public`: marketing, source directory, login, signup, and recovery
- `src/routes/individual`: feed, search/explore, saves/watchlists, profiles, and release reader
- `src/routes/institution`: organisation dashboard, publishing, releases, analytics, team, and settings
- `src/routes/admin` and `src/components/shells/AdminShell.tsx`: standalone global platform supervision
- `src/lib`: Supabase access, mapping, sanitization, activity, URL, theme, Realtime, and data hooks
- `src/store`: session-bound UI state for saves, follows, watchlists, and toasts

## Authentication and route authorization

`AuthProvider` restores the Supabase session and loads the caller's profile, including account moderation state. Missing/error profiles expose retry and sign-out actions instead of an indefinite spinner.

`ProtectedRoute` independently checks session, account state, role, and the `is_admin` grant. `/admin` is wrapped with `admin=true`; unauthenticated requests go to the separate `/admin/login`, while normal users and institution accounts are redirected to their own home. No organisation or reader sidebar contains an admin entry. An authenticated platform admin is likewise redirected out of role-specific workspaces and back to `/admin`.

This client gate is not the security boundary. Every admin RPC calls `require_platform_admin()`, and RLS/column grants block direct normal-account access.

## Database authorization and moderation

Migrations `0015` and `0016` are the authoritative final policy layer.

- Browser clients cannot alter profile authority, verification, moderation, or verified organisation-name fields.
- Release writes require an active owner/admin/editor membership; publishing also requires an active verified owner.
- `profiles.account_status` supports `active`, `archived`, and `banned`.
- `releases.moderation_status` supports `active`, `archived`, and `deleted`.
- Inactive accounts lose organisation authority and protected-table access immediately.
- A non-active institution owner makes the institution and its posts non-public.
- Admin mutations require a reason, cannot target the acting/protected admin account, and produce immutable audit entries in the same transaction.
- Public release helpers, engagement counters, comments, saves, watchlists, share pages, and sitemap reads all respect active moderation and verification state.

Column-level grants keep moderation reasons and audit records out of normal table reads. The legacy verification token is removed before profiles are added to Realtime.

## Global administration and activity

The admin console uses its own shell and reads paginated, server-authorized RPCs for users, institution owners, releases, user activity, privileged audit entries, pending reviews, and invitations. It does not mount organisation search, notifications, sidebars, identity, or mobile navigation.

Core database mutations are recorded by transaction-bound triggers for profiles, releases, follows, saves, comments, watchlists, watchlist items, and organisation membership. Deliberate client events add login/logout, page, release-view, publishing, and comment context through `record_user_activity()`.

Activity metadata is size-limited, rate-limited, actor-bound to `auth.uid()`, and recursively rejects sensitive-looking keys. Browser roles have no direct access to activity or audit tables.

## Realtime feed behavior

The reader feed loads the latest verified published rows from `release_details`. A Postgres Changes subscription watches release inserts and publish transitions; a polling fallback closes subscription gaps.

New rows remain buffered until the reader clicks the floating count chip. Following-tab posts are consumed separately so unrelated buffered posts are not lost. IDs are deduplicated and ordered by publish time.

A separate periodic reconciliation queries the currently visible IDs through RLS. Admin archive/delete, unpublish, or institution suspension therefore removes stale cards from an open feed without requiring a manual refresh.

## Content, UI, and privacy

Institution rich text is sanitized with DOMPurify using a small tag/attribute allowlist. Dangerous protocols and protocol-relative links are rejected. Public website URLs accept only credential-free HTTP(S) values.

Authenticated shells use shared premium surface, border, elevation, focus, and responsive navigation styles. `useTheme` stores `system`, `light`, or `dark` preference locally, reacts to operating-system changes, and exposes top-bar and institution-settings controls.

PostHog remains optional, with autocapture, page-leave capture, and session recording disabled. Invitation paths are redacted. Notification read state is namespaced by account.

## Persistence and honest states

Saves and follows are optimistic but roll back on database failure. Watchlists, comments, profiles, releases, institution metrics, directories, notifications, search, and analytics are database-backed. Loading, error, unavailable, and empty states do not substitute estimated or sample business data.

View counts accept only active, verified, published UUID releases and are deduplicated per authenticated viewer over the database interval. Institution analytics report measured release/view/comment/follower data; unsupported demographic/device metrics are explicitly labelled untracked.

## AI and server output

The `summarize` and `translate` Edge Functions require JWTs, validate the caller, enforce body/output/model bounds and timeouts, and consume shared database quotas. Summary generation reads the canonical release through the caller's authorization.

The server-rendered release function escapes HTML and JSON-LD boundaries, uses a nonce-based CSP, validates canonical origins, applies fetch timeouts, and queries only moderation-safe published rows through anon RLS.

## Verification

Run:

```bash
npm run typecheck
npm test
npm audit
npm run build
```

The suite covers redirect validation, URL handling, sanitization attacks, release attribution/mapping, Realtime buffering, analytics redaction, server escaping/CSP, sitemap safety, and required migration controls. SQL still requires application against a staging Supabase/Postgres project before production.

Platform-admin bootstrap and legitimate verified-name changes remain privileged operational procedures; they are intentionally unavailable to browser clients.
