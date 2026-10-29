# Supabase setup for the native app

Use the same Supabase project as any existing Presspaper deployment to preserve accounts, releases, saves, follows, comments, watchlists, analytics and moderation. Never apply migrations to an unspecified production database.

## Database

For a new development project, run [presspaper_all_migrations.sql](./presspaper_all_migrations.sql) in the Supabase SQL Editor. It contains migrations 0001–0018. For an existing project, apply only migrations after its current version from [supabase/migrations](./supabase/migrations).

Before applying 0015 to established data, reconcile duplicate active owners:

```sql
select institution_slug, count(*)
from public.org_members
where role = 'owner' and status = 'active'
group by institution_slug
having count(*) > 1;
```

Migration 0015 intentionally stops if this query returns rows. Migrations 0015–0018 enforce authorization, moderation, invitation expiry and single use, organization authority, engagement, history and publishing catalogues. Keep RLS and checked RPCs enabled. The `org-media` storage bucket and its policies support organization logos and release covers.

## Native configuration and authentication

Copy `.env.example` to the ignored `.env.local`, then set:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://your-development-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
EXPO_PUBLIC_SITE_URL=https://your-share-domain.example
```

These public values are embedded in native bundles. Never use a service-role key or AI provider key in `EXPO_PUBLIC_*` variables.

Keep email confirmation enabled. Add these allowed redirect URLs in Supabase Auth URL configuration:

```text
presspaper://auth/callback
presspaper://reset-password
```

Test callbacks on an installed development or signed build, both cold and warm. Institution and team invitations require the confirmed account email to match the invited address.

## Bootstrap the platform administrator

Create and confirm a dedicated reader account through the native app first. Do not reuse an institution owner or member account. Obtain that account's exact UUID from the Supabase dashboard, then use the SQL Editor with a privileged connection:

```sql
update public.profiles
set is_admin = true
where id = '<confirmed-auth-user-uuid>';
```

Sign in with that dedicated account; the native app opens the standalone admin workspace. Use it to issue email-locked institution invitations, review institutions, manage publishing catalogues and supervise the platform. A normal account cannot grant itself authority. No default passwords or pre-created accounts are shipped.

## Optional AI functions

Deploy the existing `summarize` and `translate` Edge Functions from `supabase/functions` if AI summaries and translation are required. Supply Gemini credentials securely through the Supabase dashboard or its CLI secret mechanism, never through native variables or committed files. The functions keep JWT verification enabled, revalidate callers and enforce database quotas. `GEMINI_MODEL` defaults to the model selected in the function code unless configured on Supabase.

Run the Supabase CLI from this repository root to link the intended development project and deploy each function. Do not disable JWT verification. If the functions are unavailable, the app retains the publisher's source summary and original language.

## Public shared links

The optional [services/share](./services/share/README.md) backend provides public article previews and rich-link metadata. It uses `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `PUBLIC_SITE_URL` on its own server deployment. Point the native `EXPO_PUBLIC_SITE_URL` at that HTTPS origin. Its primary article action opens `presspaper://release/:id`.

## Staging checks

Follow [PARITY.md](./PARITY.md) with real reader, institution owner, editor/viewer, pending-member and platform-admin accounts. Verify live cross-device persistence, publication/reconciliation, invitations, recovery, role restrictions, uploads, AI failure states, moderation and immutable audit history before releasing binaries.
