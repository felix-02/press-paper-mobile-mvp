import { Parser } from "htmlparser2";

const allowed = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "hr",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "blockquote",
  "a",
]);
const dropped = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "svg",
  "math",
  "template",
]);
const voidTags = new Set(["br", "hr"]);
function escapeText(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function safeHref(value: string): boolean {
  const url = value.trim();
  if (/[\u0000-\u0020\\]/.test(url)) return false;
  return /^(https?:|mailto:|\/(?!\/)|#)/i.test(url);
}
/** Portable allowlist parser. Native rendering never executes HTML or scripts. */
export function sanitizeRichText(html: string): string {
  let result = "";
  let blocked = 0;
  const stack: { name: string; output: boolean; blocks: boolean }[] = [];
  const parser = new Parser(
    {
      onopentag(name, attrs) {
        const blocks = dropped.has(name);
        if (blocks) blocked++;
        const output = blocked === 0 && allowed.has(name);
        stack.push({ name, output, blocks });
        if (!output) return;
        result += `<${name}`;
        if (name === "a") {
          if (attrs.href && safeHref(attrs.href))
            result += ` href="${escapeText(attrs.href.trim())}"`;
          if (attrs.title) result += ` title="${escapeText(attrs.title)}"`;
        }
        result += ">";
      },
      ontext(text) {
        if (!blocked) result += escapeText(text);
      },
      onclosetag(name) {
        const entry = stack.pop();
        if (entry?.blocks) blocked--;
        if (entry?.output && !voidTags.has(name)) result += `</${name}>`;
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();
  return result;
}
