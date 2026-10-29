# Desktop-to-native parity review

This document maps the original browser application to the native implementation now at the repository root. The original browser source remains available in Git history. A screen existing in source is not proof that its behavior has passed on an Android or iOS device. Use the acceptance checks below with a staging Supabase project before distribution.

## Route and workflow inventory

| Desktop route / feature                      | Native destination                 | Acceptance behavior                                                                                                                                          |
| -------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`, `/login`, `/admin/login`                | Login and role-specific navigation | Login restores the correct reader, institution, or independent admin workspace. Ordinary accounts cannot enter admin screens.                                |
| `/signup`                                    | Sign up                            | Reader account creation, email confirmation, enumeration-safe response; institution signup remains invitation-only.                                          |
| `/reset-password`                            | Password recovery                  | Email link opens the app, establishes recovery session, changes password, and returns to the correct workspace.                                              |
| `/sources`                                   | Sources                            | Live verified institutions, search, safe website links, public profiles.                                                                                     |
| `/home`                                      | Feed                               | Latest/following feeds, buffered new-release notification, deduplication, pagination, and reconciliation after moderation/unpublishing.                      |
| `/explore`                                   | Explore                            | Search and category browsing across institutions and releases.                                                                                               |
| `/saved`                                     | Saved                              | Saved releases and watchlists persist across devices and roll back on failed writes.                                                                         |
| `/watchlist/:id`                             | Watchlist                          | Create, rename, delete lists; add/remove releases; inaccessible lists fail clearly.                                                                          |
| `/me`                                        | Profile                            | Full name/bio editing, followed institutions, saved releases, activity, theme, and sign-out.                                                                 |
| `/institution/:slug`                         | Source                             | Canonical name/logo, verification, description, website, published releases, follow/unfollow.                                                                |
| `/release/:id`, `/r/:id`                     | Release                            | Safe rich text, canonical publisher, view count, saves, follows, watchlists, sharing/export, comments/replies, reactions, and previous versions.             |
| Release AI controls                          | Release                            | Authenticated summary and translation using the existing language catalogue; source summary remains clearly identified when AI is unavailable.               |
| Followed-institution notifications           | Notifications                      | Live recent releases from followed sources; no fabricated notification data.                                                                                 |
| `/inst`                                      | Dashboard                          | Actual release, follower, view, comment totals and recent releases.                                                                                          |
| `/inst/publish`, `/inst/publish/:id`         | Publish                            | Create/edit/review, save draft, publish, preserve publish timestamp; enforce editor permissions and verification.                                            |
| Publishing catalogue and images              | Publish / institution profile      | Database release types/platform covers, custom cover upload, organisation logo upload, limits and upload failures.                                           |
| `/inst/releases`                             | Releases                           | Search/filter workspace releases, open/edit, preserve permissions.                                                                                           |
| `/inst/analytics`, `/inst/audience`          | Analytics / Audience               | Measured totals and time series; unsupported demographics stay explicitly untracked.                                                                         |
| `/inst/profile`                              | Institution profile                | Owner-managed description/category/location/site/logo; verified name remains immutable.                                                                      |
| `/inst/settings`                             | Settings                           | Account information, persisted system/light/dark preference, sign-out.                                                                                       |
| `/inst/team`                                 | Team                               | Five-seat accounting, invites, role changes, pending-member approval/decline, revoke.                                                                        |
| `/onboarding`                                | Onboarding                         | Approved owner provides profile details; completion must be verified as persisted.                                                                           |
| Pending institution / inactive seat          | Pending review / Team gate         | Unapproved organisations cannot enter workspace; inactive memberships cannot publish.                                                                        |
| `/join/:token`, `/institution-invite/:token` | Invitation                         | Correct token kind, confirmed matching email, expiry/single-use handling, retain destination through login.                                                  |
| `/admin`                                     | Administration                     | Users, institutions, releases, activity/audit pagination, moderation/recovery with reasons, approval/rejection, invitation management, publishing catalogue. |
| `/help`                                      | Help                               | Reachable help/contact information without losing the current session.                                                                                       |

## Backend contract

Both clients use the same Supabase database and migrations `0001`–`0018`. Native navigation is not an authorization boundary; existing RLS, grants and checked RPCs continue to enforce permissions.

| Capability            | Tables / RPCs / functions                                                                                                                                                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity              | Supabase Auth; `profiles`; moderation state and `is_admin`                                                                                                                                                                                                     |
| Reading               | `release_details`, `institution_stats`, `public_institutions(p_limit)`, `public_institution(p_slug)`                                                                                                                                                           |
| Reader engagement     | `saved_releases`, `follows`, `watchlists`, `watchlist_items`, `comments`, `increment_release_views(rid)`                                                                                                                                                       |
| Reactions / revisions | `release_reactions`, `release_reaction_counts(p_release)`, `release_revisions`                                                                                                                                                                                 |
| Publishing            | `releases`, `platform_release_types`, `platform_covers`, Storage bucket `org-media`                                                                                                                                                                            |
| Organisation access   | `org_members_detail(slug)`, `org_is_verified(slug)`, `list_org_invites(p_slug)`                                                                                                                                                                                |
| Team management       | `create_org_invite(p_slug,p_email,p_role)`, `revoke_org_invite(p_id)`, `set_member_status(slug,target,new_status)`, `set_member_role(slug,target,new_role)`                                                                                                    |
| Invited accounts      | `get_invite(invite_token)`, `accept_org_invite(invite_token)`, `get_platform_invite(p_token)`, `accept_platform_invite(p_token)`                                                                                                                               |
| Analytics             | `institution_view_series(days)`, `record_user_activity(p_event_type,p_target_type,p_target_id,p_metadata)`                                                                                                                                                     |
| Admin lists           | `admin_list_users`, `admin_list_institutions`, `admin_list_releases`, `admin_list_activity`, `admin_list_audit`, each paginated with `p_limit,p_offset`; `pending_institutions`, `platform_invites_list`                                                       |
| Admin actions         | `admin_set_account_status(p_target,p_status,p_reason)`, `admin_set_release_moderation(p_release,p_status,p_reason)`, `approve_institution(target)`, `reject_institution(target)`, `create_platform_invite(p_email,p_org_name)`, `revoke_platform_invite(p_id)` |
| Admin catalogue       | `admin_add_release_type(p_name)`, `admin_add_platform_cover(p_label,p_url)`                                                                                                                                                                                    |
| AI                    | `summarize` Edge Function with `{releaseId}`; `translate` with `{target,texts}`                                                                                                                                                                                |

## Native release acceptance checks

These checks are **pending device/staging verification** unless a separate test report records their execution. Passing TypeScript, pure-function tests, or Metro export does not complete them.

1. Run on a physical Android device and an iPhone, including small-screen and large-text settings. Check safe areas, keyboard avoidance, scrolling, back gestures, accessibility labels, dark/light/system appearance, and image permissions.
2. Sign in as a reader, owner, active admin/editor/viewer member, pending/declined member, and platform admin. Test forbidden deep links and each role's available actions. Ban/archive the account elsewhere and confirm the app blocks protected actions.
3. Kill/reopen the app, refresh an expired session, background/foreground it, sign out, then sign in as another account. Confirm session restoration and that the previous account's saves/follows/watchlists are cleared.
4. Open release, source, watchlist, team invite, platform invite, email confirmation, and recovery links while the app is closed and already running. Repeat while signed out and while signed in as the wrong account. Verify expired/consumed invite handling.
5. Publish from the website; receive buffered feed updates on mobile and consume them once. Publish/edit from mobile; verify the desktop content and revision history. Archive/unpublish through admin; verify the open feed reconciles it away.
6. Save/follow/react/comment/reply/manage watchlists on each client and confirm the other client sees the same persisted state. Simulate failed requests and check rollback, errors, retry, and no false success.
7. Create/edit drafts and formatted published releases; upload a supported cover and logo; reject oversized/unsupported files. Confirm headings, lists, quotes, links and existing HTML survive editing without exposing script/event attributes.
8. Exercise approval, team seats/invitations/roles, onboarding, every admin moderation status and recovery, mandatory reasons, admin protection, and audit records. Verify catalogue additions appear in mobile and desktop publishing.
9. Verify AI summary/translation with deployed functions and signed-in users, plus graceful function/network/quota failure. Exercise all language labels from the shared catalogue.
10. Export/share release text, open safe external links, check source-logo/custom-cover rendering, and verify no credentials or invitation tokens appear in logs or activity metadata.

## Scope boundaries

The native application uses native controls and navigation, so desktop hover menus, wide tables, and browser download behavior become touch controls, stacked lists, and the native share/export workflow. Public article previews are retained in the optional `services/share/` backend. Browser UI and sitemap generation are removed. App-store distribution, signing, universal-link domain association, and production Supabase deployment are separate operational steps.

The existing browser code does not implement scheduled-publishing controls, comment editing or comment likes, push-notification registration, offline business-data mode, or demographic collection. The `Scheduled` domain value alone is not evidence of a working scheduler. Those features should not be counted as browser-to-native regressions or claimed as delivered without additional implementation.

Optional browser PostHog telemetry is not enabled in the native client. The native client preserves the bounded database activity stream; adding a native PostHog SDK is separate from institution readership analytics, which use the same measured database data.
