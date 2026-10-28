# Running Presspaper

Presspaper requires Node.js 20.19 or newer and a configured Supabase project. It does not substitute local sample data when the database is unavailable.

## Local development

Copy `.env.example` to `.env` and configure:

```dotenv
VITE_APP_MODE=live
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Apply migrations through `0016_super_admin_moderation.sql`, then run:

```bash
npm install
npm run dev
```

Vite normally serves the app at `http://localhost:5173`. Browser routing requires an HTTP server; opening `dist/index.html` directly is not supported.

## Main workflows

### Reader

1. Sign up, confirm the email, and log in.
2. Follow verified institutions and read the database-backed feed.
3. Save releases, create watchlists, comment, translate, or request an AI summary.
4. Leave the feed open while another institution publishes; the new-release chip should appear without a refresh.

### Institution owner

1. Accept a platform-issued institution invitation using the exact invited email.
2. Complete the organisation profile and save drafts while review is pending.
3. After platform approval, publish a release and verify that it appears in reader feeds.
4. Manage team membership and roles from the Team screen.
5. Sign out from either the top-bar account menu or Settings.

### Global super admin

1. Bootstrap one dedicated, confirmed platform account as described in [SUPABASE_SETUP.md](./SUPABASE_SETUP.md). Do not use an institution owner/member account.
2. Sign in at `/admin/login`; successful authorization opens the standalone `/admin` console.
3. Review all users, institution owners, posts, activity, audit records, and invitations.
4. Archive, ban, or recover a non-admin account with a required reason.
5. Archive, delete, or recover a post with a required reason.

The platform identity has no institution/reader navigation. While it is signed in, attempts to enter role-specific workspaces are redirected back to `/admin`.

## Production verification

```bash
npm ci
npm run typecheck
npm test
npm audit
npm run build
```

The build requires both Supabase browser variables. On Vercel, `vercel.json` reserves `/r/:id` and `/sitemap.xml` for server functions and rewrites other application deep links to `index.html`.

Database migrations must also be applied to a staging Supabase project and exercised with real reader, institution, and admin accounts before production release.
