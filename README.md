# Presspaper

Presspaper is a database-backed platform for verified institutions to publish official releases and for readers to follow, save, discuss, and monitor them.

There is no fixture or offline runtime mode. Accounts, institutions, releases, engagement, comments, watchlists, analytics, and administration data all come from Supabase. A missing runtime configuration fails closed.

## Quick start

Use Node.js 20.19 or newer; Node 22 LTS is recommended.

```bash
cp .env.example .env
npm install
npm run dev
```

Set the Supabase URL and anon key in `.env`, then apply database migrations through `0016_super_admin_moderation.sql`. See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for the full setup and super-admin bootstrap.

## Commands

```bash
npm run dev        # Vite development server
npm run typecheck  # strict TypeScript validation
npm test           # Vitest regression suite
npm run build      # production build; requires Supabase variables
npm run check      # typecheck, tests, build, and dependency audit
```

## Product capabilities

- Invite-only, verified institution workspaces with owner/admin/editor/viewer permissions
- Database-backed publishing, drafts, public profiles, feeds, search, saves, follows, watchlists, comments, and analytics
- Realtime new-release detection with a buffered “new releases” chip and polling fallback
- Global `/admin` console for users, institutions, posts, activity, invitations, and immutable moderation history
- Recoverable account archive/ban and post archive/delete controls, enforced by RLS and checked RPCs
- Persisted system/light/dark appearance controls and responsive authenticated shells
- Sanitized rich text, authenticated AI summary/translation functions, share pages, and sitemap output

Normal accounts never receive an admin navigation item. Direct `/admin` requests are checked by the protected route, and every admin read or mutation is independently authorized in Postgres.

## Stack

- React 18, TypeScript, Vite, React Router, Zustand
- Supabase Auth, Postgres RLS, Realtime, checked `SECURITY DEFINER` RPCs, Edge Functions
- DOMPurify for institution-authored rich text
- Vercel functions for `/r/:id` share pages and `/sitemap.xml`
- Optional privacy-limited PostHog analytics

See [DOCUMENTATION.md](./DOCUMENTATION.md) for implementation boundaries and [HOW_TO_RUN.md](./HOW_TO_RUN.md) for local and release workflows.
