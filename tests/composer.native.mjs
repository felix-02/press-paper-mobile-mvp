import test from "node:test";
import assert from "node:assert/strict";
import {
  parseBlocks,
  blocksHtml,
} from "../src/components/institution/richComposerModel.ts";

test("editing a neighbouring paragraph preserves ordered list numbering and inline marks", () => {
  const blocks = parseBlocks(
    "<ol><li>First <strong>important</strong></li><li>Second</li></ol><p>After</p>",
  );
  blocks[2] = {
    ...blocks[2],
    original: undefined,
    chars: [{ value: "X", marks: [] }],
  };
  assert.equal(
    blocksHtml(blocks),
    "<ol><li>First <strong>important</strong></li><li>Second</li></ol><p>X</p>",
  );
});
test("serializes edited marks and links without allowing raw user text to create HTML", () => {
  const [block] = parseBlocks("<p>Text</p>");
  const edited = {
    ...block,
    original: undefined,
    chars: [
      { value: "<", marks: ["strong"], href: "https://example.org/?a=1&b=2" },
      { value: "x", marks: ["strong"], href: "https://example.org/?a=1&b=2" },
    ],
  };
  assert.equal(
    blocksHtml([edited]),
    '<p><a href="https://example.org/?a=1&amp;b=2"><strong>&lt;x</strong></a></p>',
  );
});
test("keeps nested list HTML when editing a separate block", () => {
  const blocks = parseBlocks(
    "<ul><li>One<ul><li>Nested</li></ul></li><li>Two</li></ul><p>End</p>",
  );
  assert.equal(
    blocksHtml(blocks),
    "<ul><li>One<ul><li>Nested</li></ul></li><li>Two</li></ul><p>End</p>",
  );
});
