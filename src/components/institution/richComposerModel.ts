import { parseDocument } from "htmlparser2";
import { sanitizeRichText } from "../../lib/sanitizeHtml.ts";
export type Mark = "strong" | "em" | "u" | "s";
export type Char = { value: string; marks: Mark[]; href?: string };
export type Block = {
  id: number;
  tag: "p" | "h2" | "h3" | "blockquote" | "ul" | "ol" | "hr";
  chars: Char[];
  original?: string;
};
type Node = {
  type: string;
  name?: string;
  data?: string;
  attribs?: Record<string, string>;
  children?: Node[];
};
let nextId = 0;
const escape = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
function serialize(node: Node): string {
  if (node.type === "text") return escape(node.data ?? "");
  if (!node.name) return "";
  const attrs = Object.entries(node.attribs ?? {})
    .map(([key, val]) => ` ${key}="${escape(val)}"`)
    .join("");
  if (node.name === "br" || node.name === "hr") return `<${node.name}>`;
  return `<${node.name}${attrs}>${(node.children ?? []).map(serialize).join("")}</${node.name}>`;
}
function charsFrom(node: Node, marks: Mark[] = [], href?: string): Char[] {
  if (node.type === "text")
    return (node.data ?? "")
      .split("")
      .map((value) => ({ value, marks: [...marks], href }));
  if (node.name === "br") return [{ value: "\n", marks: [...marks], href }];
  const aliases: Record<string, Mark> = {
    strong: "strong",
    b: "strong",
    em: "em",
    i: "em",
    u: "u",
    s: "s",
    strike: "s",
  };
  const mark = node.name ? aliases[node.name] : undefined;
  return (node.children ?? []).flatMap((child) =>
    charsFrom(
      child,
      mark ? [...marks, mark] : marks,
      node.name === "a" ? node.attribs?.href : href,
    ),
  );
}
export function parseBlocks(html: string): Block[] {
  const doc = parseDocument(sanitizeRichText(html));
  const blocks: Block[] = [];
  for (const node of doc.children as Node[]) {
    if (node.type === "text" && !node.data?.trim()) continue;
    if (node.name === "ul" || node.name === "ol") {
      for (const item of node.children ?? [])
        if (item.name === "li")
          blocks.push({
            id: ++nextId,
            tag: node.name,
            chars: charsFrom(item),
            original: `<${node.name}>${serialize(item)}</${node.name}>`,
          });
    } else {
      const name = node.name;
      const tag =
        name === "h2" || name === "h3" || name === "blockquote" || name === "hr"
          ? name
          : "p";
      blocks.push({
        id: ++nextId,
        tag,
        chars: charsFrom(node),
        original: serialize(node),
      });
    }
  }
  return blocks.length ? blocks : [{ id: ++nextId, tag: "p", chars: [] }];
}
export function blockHtml(block: Block): string {
  if (block.original !== undefined) return block.original;
  if (block.tag === "hr") return "<hr>";
  const runs: { text: string; marks: Mark[]; href?: string }[] = [];
  for (const char of block.chars) {
    const last = runs.at(-1);
    if (
      last &&
      last.href === char.href &&
      last.marks.join() === char.marks.join()
    )
      last.text += char.value;
    else runs.push({ text: char.value, marks: char.marks, href: char.href });
  }
  const inner = runs
    .map((run) => {
      let html = escape(run.text).replace(/\n/g, "<br>");
      for (const mark of run.marks) html = `<${mark}>${html}</${mark}>`;
      return run.href ? `<a href="${escape(run.href)}">${html}</a>` : html;
    })
    .join("");
  return block.tag === "ul" || block.tag === "ol"
    ? `<${block.tag}><li>${inner}</li></${block.tag}>`
    : `<${block.tag}>${inner}</${block.tag}>`;
}

export function blocksHtml(blocks: Block[]): string {
  let html = "";
  let openList: "ul" | "ol" | null = null;
  for (const block of blocks) {
    const list = block.tag === "ul" || block.tag === "ol" ? block.tag : null;
    if (openList !== list) {
      if (openList) html += `</${openList}>`;
      if (list) html += `<${list}>`;
      openList = list;
    }
    const fragment = blockHtml(block);
    html += list
      ? fragment.replace(/^<(?:ul|ol)>/, "").replace(/<\/(?:ul|ol)>$/, "")
      : fragment;
  }
  if (openList) html += `</${openList}>`;
  return html;
}
export function newBlock(tag: Block["tag"] = "p"): Block {
  return { id: ++nextId, tag, chars: [] };
}
