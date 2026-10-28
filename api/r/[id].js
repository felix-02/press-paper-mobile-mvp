// Server-rendered public release page for SEO and rich link sharing.

import { randomBytes } from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const DEFAULT_PUBLIC_ORIGIN = "https://presspaper.ai";
const FETCH_TIMEOUT_MS = 5_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function contentSecurityPolicy(nonce = "") {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "connect-src 'none'",
    "font-src 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "object-src 'none'",
    nonce ? `script-src 'nonce-${nonce}'` : "script-src 'none'",
    "style-src 'unsafe-inline'",
  ].join("; ");
}

function esc(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeJsonLd(value) {
  const escaped = { "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029" };
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => escaped[character]);
}

function xmlSafeText(value = "") {
  return String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function isLoopback(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function validatedOrigin(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname))) return null;
    if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function firstHeaderValue(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.split(",", 1)[0].trim() : "";
}

function publicOrigin(req) {
  const configured = validatedOrigin(process.env.PUBLIC_SITE_URL);
  if (configured) return configured;

  const vercelProduction = validatedOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  if (vercelProduction) return vercelProduction;

  const host = firstHeaderValue(req.headers["x-forwarded-host"] || req.headers.host);
  const protocol = firstHeaderValue(req.headers["x-forwarded-proto"]) || "https";
  if (/^[a-z\d.-]+(?::\d{1,5})?$/i.test(host) && (protocol === "https" || protocol === "http")) {
    const requestOrigin = validatedOrigin(`${protocol}://${host}`);
    if (requestOrigin && isLoopback(new URL(requestOrigin).hostname)) return requestOrigin;
  }

  return DEFAULT_PUBLIC_ORIGIN;
}

function validatedSupabaseUrl() {
  return validatedOrigin(SUPABASE_URL);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function isTimeout(error) {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function setDocumentHeaders(res, nonce = "") {
  res.setHeader("Content-Security-Policy", contentSecurityPolicy(nonce));
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Strict-Transport-Security", "max-age=31536000");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
}

function sendHtml(req, res, status, html, cacheControl = "no-store", nonce = "") {
  setDocumentHeaders(res, nonce);
  res.setHeader("Cache-Control", cacheControl);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (req.method === "HEAD") return res.status(status).end();
  return res.status(status).send(html);
}

function errorPage(title, message, origin) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)} | Presspaper</title><meta name="robots" content="noindex"/>
<style>body{margin:0;background:#09090b;color:#f4f4f5;font-family:-apple-system,sans-serif;display:grid;place-items:center;min-height:100vh;text-align:center}a{color:#3b82f6}</style>
</head><body><main><h1>${esc(title)}</h1><p>${esc(message)}</p>
<p><a href="${esc(origin)}/">Go to Presspaper</a></p></main></body></html>`;
}

async function fetchVerification(supabaseUrl, institutionSlug) {
  if (!institutionSlug) return false;
  const url = new URL("/rest/v1/rpc/org_is_verified", supabaseUrl);
  const key = SUPABASE_ANON;
  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ slug: institutionSlug }),
      },
      3_000
    );
    if (!response.ok) return false;
    return (await response.json().catch(() => false)) === true;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  const origin = publicOrigin(req);

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return sendHtml(req, res, 405, errorPage("Method not allowed", "This endpoint only accepts GET requests.", origin));
  }

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!UUID.test(id)) {
    return sendHtml(req, res, 400, errorPage("Invalid release", "The release identifier is invalid.", origin));
  }

  const supabaseUrl = validatedSupabaseUrl();
  if (!supabaseUrl || !SUPABASE_ANON) {
    return sendHtml(req, res, 503, errorPage("Temporarily unavailable", "Release data is temporarily unavailable.", origin));
  }

  const releasesUrl = new URL("/rest/v1/releases", supabaseUrl);
  releasesUrl.searchParams.set("id", `eq.${id}`);
  releasesUrl.searchParams.set("status", "eq.Published");
  releasesUrl.searchParams.set(
    "select",
    "id,institution_slug,institution_name,type,heading,subheading,body,published_at,created_at"
  );
  releasesUrl.searchParams.set("limit", "1");

  let response;
  try {
    response = await fetchWithTimeout(releasesUrl, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, Accept: "application/json" },
    });
  } catch (error) {
    const status = isTimeout(error) ? 504 : 502;
    return sendHtml(req, res, status, errorPage("Temporarily unavailable", "Release data could not be loaded.", origin));
  }

  if (!response.ok) {
    return sendHtml(req, res, 502, errorPage("Temporarily unavailable", "Release data could not be loaded.", origin));
  }

  let rows;
  try {
    rows = await response.json();
  } catch {
    return sendHtml(req, res, 502, errorPage("Temporarily unavailable", "Release data could not be loaded.", origin));
  }

  if (!Array.isArray(rows)) {
    return sendHtml(req, res, 502, errorPage("Temporarily unavailable", "Release data could not be loaded.", origin));
  }

  const release = rows[0];
  if (!release) {
    return sendHtml(req, res, 404, errorPage("Release not found", "This release may be unpublished or moved.", origin));
  }

  const verified = await fetchVerification(supabaseUrl, release.institution_slug);
  const institutionName = release.institution_name || "Presspaper";
  const title = `${release.heading} - ${institutionName}`;
  const descriptionSource = release.subheading || release.body || "Public information published on Presspaper.";
  const description = xmlSafeText(descriptionSource).slice(0, 200);
  const articleBody = xmlSafeText(release.body || release.subheading || "").slice(0, 100_000);
  const publishedDate = new Date(release.published_at || release.created_at);
  const published = Number.isNaN(publishedDate.getTime()) ? null : publishedDate.toISOString();
  const formattedPublished = published
    ? publishedDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "Date unavailable";
  const canonical = `${origin}/r/${encodeURIComponent(id)}`;
  const ogImage = `${origin}/og.png`;
  const appUrl = `${origin}/release/${encodeURIComponent(id)}`;
  const nonce = randomBytes(18).toString("base64");

  const ld = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: release.heading,
    description: release.subheading || "",
    ...(published ? { datePublished: published, dateModified: published } : {}),
    articleBody,
    author: { "@type": "Organization", name: institutionName },
    publisher: { "@type": "Organization", name: "Presspaper" },
    mainEntityOfPage: canonical,
  };

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} | Presspaper</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${esc(canonical)}" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<meta property="og:site_name" content="Presspaper" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(canonical)}" />
<meta property="og:image" content="${esc(ogImage)}" />
${published ? `<meta property="article:published_time" content="${esc(published)}" />` : ""}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(ogImage)}" />
<script type="application/ld+json" nonce="${esc(nonce)}">${safeJsonLd(ld)}</script>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; background:#09090b; color:#f4f4f5; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,sans-serif; line-height:1.6; }
  .wrap { max-width:760px; margin:0 auto; padding:40px 24px 80px; }
  .brand { display:flex; align-items:center; gap:10px; font-weight:700; color:#fff; text-decoration:none; }
  .brand .glyph { width:26px; height:26px; border-radius:7px; background:linear-gradient(135deg,#2563eb,#6366f1); display:inline-block; }
  .badge { display:inline-flex; align-items:center; gap:6px; font-size:13px; color:#3b82f6; background:rgba(59,130,246,.12); border:1px solid rgba(59,130,246,.25); padding:5px 12px; border-radius:999px; }
  .badge.neutral { color:#a1a1aa; background:rgba(161,161,170,.08); border-color:rgba(161,161,170,.2); }
  h1 { font-size:34px; line-height:1.15; margin:22px 0 14px; }
  .lead { font-size:18px; color:#a1a1aa; margin:0 0 24px; }
  .meta { font-size:13px; color:#71717a; display:flex; gap:14px; align-items:center; margin-bottom:28px; }
  .body { font-size:16px; color:#d4d4d8; white-space:pre-wrap; }
  .cta { display:inline-flex; align-items:center; gap:8px; margin-top:36px; background:#fff; color:#0a0a0a; font-weight:600; text-decoration:none; padding:12px 22px; border-radius:8px; }
  .rule { height:1px; background:rgba(255,255,255,.08); margin:28px 0; border:0; }
  footer { color:#52525b; font-size:12.5px; margin-top:48px; }
  a.inline { color:#3b82f6; }
</style>
</head>
<body>
  <main class="wrap">
    <a class="brand" href="${esc(origin)}/"><span class="glyph"></span> Presspaper</a>
    <hr class="rule" />
    <span class="badge${verified ? "" : " neutral"}">${verified ? "Verified institution" : "Published by"} - ${esc(institutionName)}</span>
    <h1>${esc(release.heading)}</h1>
    ${release.subheading ? `<p class="lead">${esc(release.subheading)}</p>` : ""}
    <div class="meta">
      <span>${esc(release.type || "Announcement")}</span>
      <span>-</span>
      <span>${esc(formattedPublished)}</span>
    </div>
    ${articleBody ? `<div class="body">${esc(articleBody)}</div>` : ""}
    <a class="cta" href="${esc(appUrl)}">Read on Presspaper</a>
    <footer>Published on <a class="inline" href="${esc(origin)}/">Presspaper</a>, the home for public information.</footer>
  </main>
</body>
</html>`;

  return sendHtml(req, res, 200, html, "public, max-age=0, s-maxage=60, must-revalidate", nonce);
}

export { contentSecurityPolicy, esc, publicOrigin, safeJsonLd, validatedOrigin, xmlSafeText };
