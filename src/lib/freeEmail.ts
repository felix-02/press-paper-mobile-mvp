// Common consumer email providers. Institutions must register with a work email
// on their organisation's own domain, so these are blocked for institution
// signups (a random person can't receive mail at @bbc.co.uk).
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.in",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "hotmail.co.uk",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "aol.com",
  "zoho.com",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "yandex.com",
  "yandex.ru",
  "rediffmail.com",
  "tutanota.com",
  "fastmail.com",
  "hey.com",
]);

export function emailDomain(email: string): string {
  return (email.trim().toLowerCase().split("@")[1] ?? "").trim();
}

export function isFreeEmailDomain(email: string): boolean {
  return FREE_EMAIL_DOMAINS.has(emailDomain(email));
}
