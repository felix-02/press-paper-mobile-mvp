import React, { useEffect, useRef, useState } from "react";
import { Alert, View, useWindowDimensions } from "react-native";
import RenderHTML from "react-native-render-html";
import { Body, Button, Card, Field, Row, useTheme } from "@/ui";
import { sanitizeRichText } from "@/lib/sanitizeHtml";

import {
  parseBlocks,
  blockHtml,
  blocksHtml,
  newBlock,
  type Block,
  type Char,
  type Mark,
} from "./richComposerModel";

/** Native paragraph editor: original rich HTML is preserved until a block is edited. */
export function RichComposer({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [blocks, setBlocks] = useState(() => parseBlocks(value)),
    [editing, setEditing] = useState<number | null>(null),
    [selection, setSelection] = useState({ start: 0, end: 0 }),
    [link, setLink] = useState("");
  const history = useRef<{ past: Block[][]; future: Block[][] }>({
    past: [],
    future: [],
  });
  const lastEmitted = useRef(value),
    { width } = useWindowDimensions(),
    { colors } = useTheme();
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    history.current = { past: [], future: [] };
    setBlocks(parseBlocks(value));
    setEditing(null);
  }, [value]);
  const emit = (next: Block[], record = true) => {
    const html = blocksHtml(next);
    if (html.length > 200000) {
      Alert.alert(
        "Release is too long",
        "Shorten the release before continuing.",
      );
      return;
    }
    if (record) {
      history.current.past = [...history.current.past.slice(-99), blocks];
      history.current.future = [];
    }
    setBlocks(next);
    lastEmitted.current = html;
    onChange(html);
  };
  const undo = () => {
    const previous = history.current.past.pop();
    if (!previous) return;
    history.current.future.push(blocks);
    setEditing(null);
    emit(previous, false);
  };
  const redo = () => {
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push(blocks);
    setEditing(null);
    emit(next, false);
  };
  const current = blocks.find((b) => b.id === editing);
  const update = (block: Block) =>
    emit(blocks.map((b) => (b.id === block.id ? block : b)));
  const apply = (transform: (c: Char) => Char) => {
    if (!current) return;
    const from = Math.min(selection.start, selection.end),
      to = Math.max(selection.start, selection.end);
    if (from === to) {
      Alert.alert(
        "Select some text",
        "Select the words you want to format in the paragraph field.",
      );
      return;
    }
    update({
      ...current,
      original: undefined,
      chars: current.chars.map((c, i) =>
        i >= from && i < to ? transform(c) : c,
      ),
    });
  };
  const mark = (m: Mark) => {
    if (!current) return;
    const selected = current.chars.slice(selection.start, selection.end);
    const remove =
      selected.length > 0 && selected.every((c) => c.marks.includes(m));
    apply((c) => ({
      ...c,
      marks: remove
        ? c.marks.filter((x) => x !== m)
        : Array.from(new Set([...c.marks, m])),
    }));
  };
  const changeText = (text: string) => {
    if (!current) return;
    const previous = current.chars.map((c) => c.value).join("");
    let start = 0;
    while (
      start < text.length &&
      start < previous.length &&
      text[start] === previous[start]
    )
      start++;
    let endOld = previous.length,
      endNew = text.length;
    while (
      endOld > start &&
      endNew > start &&
      previous[endOld - 1] === text[endNew - 1]
    ) {
      endOld--;
      endNew--;
    }
    const inherit = current.chars[Math.max(0, start - 1)];
    const inserted = text
      .slice(start, endNew)
      .split("")
      .map((v) => ({
        value: v,
        marks: inherit?.marks ?? [],
        href: inherit?.href,
      }));
    update({
      ...current,
      original: undefined,
      chars: [
        ...current.chars.slice(0, start),
        ...inserted,
        ...current.chars.slice(endOld),
      ],
    });
  };
  const types: { label: string; tag: Block["tag"] }[] = [
    { label: "Paragraph", tag: "p" },
    { label: "Heading", tag: "h2" },
    { label: "Subheading", tag: "h3" },
    { label: "Quote", tag: "blockquote" },
    { label: "Bullet", tag: "ul" },
    { label: "Numbered item", tag: "ol" },
  ];
  return (
    <View style={{ gap: 12 }}>
      <Body>Release body</Body>
      <Row>
        <Button
          title="Undo"
          variant="secondary"
          disabled={!history.current.past.length}
          onPress={undo}
        />
        <Button
          title="Redo"
          variant="secondary"
          disabled={!history.current.future.length}
          onPress={redo}
        />
      </Row>
      {blocks.map((block, index) => (
        <Card key={block.id}>
          <RenderHTML
            contentWidth={width - 100}
            source={{
              html:
                sanitizeRichText(blockHtml(block)) ||
                "<p>Write your release…</p>",
            }}
            baseStyle={{ color: colors.text }}
          />
          {editing === block.id && block.tag !== "hr" ? (
            <>
              <Field
                label={`Paragraph ${index + 1}`}
                multiline
                value={block.chars.map((c) => c.value).join("")}
                onChangeText={changeText}
                onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
                maxLength={200000}
              />
              <Row>
                {types.map((t) => (
                  <Button
                    key={t.tag}
                    title={t.tag === block.tag ? `✓ ${t.label}` : t.label}
                    variant="secondary"
                    onPress={() =>
                      update({ ...block, tag: t.tag, original: undefined })
                    }
                  />
                ))}
              </Row>
              <Body>
                Select text in the paragraph to format it. The preview above
                shows the published version.
              </Body>
              <Row>
                {(["strong", "em", "u", "s"] as Mark[]).map((m, i) => (
                  <Button
                    key={m}
                    title={["Bold", "Italic", "Underline", "Strike"][i]}
                    variant="secondary"
                    onPress={() => mark(m)}
                  />
                ))}
                <Button
                  title="Clear formatting"
                  variant="secondary"
                  onPress={() =>
                    apply((c) => ({ ...c, marks: [], href: undefined }))
                  }
                />
              </Row>
              <Field
                label="Link address"
                value={link}
                onChangeText={setLink}
                autoCapitalize="none"
                keyboardType="url"
                placeholder="https://"
              />
              <Row>
                <Button
                  title="Link selected text"
                  variant="secondary"
                  onPress={() => {
                    try {
                      const url = new URL(link);
                      if (
                        !["https:", "http:", "mailto:"].includes(
                          url.protocol,
                        ) ||
                        url.username ||
                        url.password
                      )
                        throw new Error();
                      apply((c) => ({ ...c, href: url.toString() }));
                      setLink("");
                    } catch {
                      Alert.alert(
                        "Invalid link",
                        "Use a valid HTTP, HTTPS or email address.",
                      );
                    }
                  }}
                />
                <Button
                  title="Remove link"
                  variant="secondary"
                  onPress={() => apply((c) => ({ ...c, href: undefined }))}
                />
              </Row>
              <Button
                title="Done editing paragraph"
                variant="secondary"
                onPress={() => setEditing(null)}
              />
            </>
          ) : block.tag !== "hr" ? (
            <Button
              title={`Edit paragraph ${index + 1}`}
              variant="secondary"
              onPress={() => {
                setEditing(block.id);
                setSelection({ start: 0, end: 0 });
              }}
            />
          ) : null}
          <Row>
            {index > 0 && (
              <Button
                title="Move up"
                variant="secondary"
                onPress={() => {
                  const next = [...blocks];
                  [next[index - 1], next[index]] = [
                    next[index],
                    next[index - 1],
                  ];
                  emit(next);
                }}
              />
            )}
            {index < blocks.length - 1 && (
              <Button
                title="Move down"
                variant="secondary"
                onPress={() => {
                  const next = [...blocks];
                  [next[index + 1], next[index]] = [
                    next[index],
                    next[index + 1],
                  ];
                  emit(next);
                }}
              />
            )}
            <Button
              title="Remove paragraph"
              variant="secondary"
              onPress={() =>
                Alert.alert(
                  "Remove this paragraph?",
                  "This removes the paragraph from your draft.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Remove",
                      style: "destructive",
                      onPress: () => {
                        emit(blocks.filter((b) => b.id !== block.id));
                        setEditing(null);
                      },
                    },
                  ],
                )
              }
            />
          </Row>
        </Card>
      ))}
      <Row>
        <Button
          title="Add paragraph"
          variant="secondary"
          onPress={() => {
            const block = newBlock();
            emit([...blocks, block]);
            setEditing(block.id);
            setSelection({ start: 0, end: 0 });
          }}
        />
        <Button
          title="Add divider"
          variant="secondary"
          onPress={() => emit([...blocks, newBlock("hr")])}
        />
      </Row>
    </View>
  );
}
