// Dynamic sitemap of published releases. Served at /sitemap.xml.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const DEFAULT_PUBLIC_ORIGIN = "https://presspaper.ai";
const FETCH_TIMEOUT_MS = 5_000;
const PAGE_SIZE = 1_000;
const MAX_RELEASES = 49_999;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function xml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function isTimeout(error) {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function setResponseHeaders(res) {
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Strict-Transport-Security", "max-age=31536000");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function send(req, res, status, body, contentType, cacheControl = "no-store") {
  setResponseHeaders(res);
  res.setHeader("Cache-Control", cacheControl);
  res.setHeader("Content-Type", contentType);
  if (req.method === "HEAD") return res.status(status).end();
  return res.status(status).send(body);
}

function sendError(req, res, status, message) {
  return send(req, res, status, message, "text/plain; charset=utf-8");
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return sendError(req, res, 405, "Method not allowed");
  }

  const origin = publicOrigin(req);
  const supabaseUrl = validatedOrigin(SUPABASE_URL);
  if (!supabaseUrl || !SUPABASE_ANON) {
    return sendError(req, res, 503, "Sitemap temporarily unavailable");
  }

  const rows = [];
  try {
    for (let offset = 0; offset < MAX_RELEASES; offset += PAGE_SIZE) {
      const releasesUrl = new URL("/rest/v1/releases", supabaseUrl);
      releasesUrl.searchParams.set("status", "eq.Published");
      releasesUrl.searchParams.set("select", "id,published_at,created_at");
      releasesUrl.searchParams.set("order", "created_at.desc");
      releasesUrl.searchParams.set("limit", String(PAGE_SIZE));
      releasesUrl.searchParams.set("offset", String(offset));

      const response = await fetchWithTimeout(releasesUrl, {
        headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, Accept: "application/json" },
      });
      if (!response.ok) return sendError(req, res, 502, "Sitemap temporarily unavailable");

      const page = await response.json().catch(() => null);
      if (!Array.isArray(page)) return sendError(req, res, 502, "Sitemap temporarily unavailable");
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
  } catch (error) {
    return sendError(req, res, isTimeout(error) ? 504 : 502, "Sitemap temporarily unavailable");
  }

  const releaseUrls = rows.slice(0, MAX_RELEASES).flatMap((row) => {
    if (!row || typeof row.id !== "string" || !UUID.test(row.id)) return [];
    const location = `${origin}/r/${encodeURIComponent(row.id)}`;
    const date = new Date(row.published_at || row.created_at);
    const lastModified = Number.isNaN(date.getTime()) ? "" : `<lastmod>${xml(date.toISOString())}</lastmod>`;
    return [
      `<url><loc>${xml(location)}</loc>${lastModified}<changefreq>weekly</changefreq><priority>0.8</priority></url>`,
    ];
  });

  const urls = [
    `<url><loc>${xml(`${origin}/`)}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...releaseUrls,
  ].join("");
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;

  return send(
    req,
    res,
    200,
    sitemap,
    "application/xml; charset=utf-8",
    "public, max-age=0, s-maxage=3600, must-revalidate"
  );
}

export { publicOrigin, validatedOrigin, xml };
