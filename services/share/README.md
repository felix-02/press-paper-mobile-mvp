# Public links shared by the mobile app

This optional backend serves `/r/:id` article previews and social metadata for recipients without the app. Its primary button opens `presspaper://release/:id`. It contains no browser application, authentication forms, publishing UI, or sitemap.

The native client uses `EXPO_PUBLIC_SITE_URL` as the public origin for these links. Keep an existing compatible share deployment, or deploy this directory as a separate Vercel project with **Root Directory = services/share**, no framework/build command, and output directory `public`.

Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY` (public anon/publishable key), and `PUBLIC_SITE_URL` on the service. Use the same Supabase project as the native app and an HTTPS origin you control. Keep service-role keys out of this service. Database RLS and verification checks restrict article visibility.

Run `npm test` in this directory. The root test command includes these checks too. Domain association for iOS Universal Links and Android App Links remains a separate release configuration step; this service currently uses the explicit app scheme.
