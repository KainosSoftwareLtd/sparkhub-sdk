import { describe, expect, it } from "vitest";
import {
  normalizeDocument,
  documentPlainText,
  inlineContentPlainText,
  type ViewerSchemaInfo,
} from "./normalize";

/**
 * Static mirror of the shipped viewer schema (block/inline types + prop
 * schemas relevant to these tests). Kept static so the normalizer tests run
 * in a plain node environment without importing BlockNote/React; the
 * `schema.test.ts` suite asserts the LIVE schema exposes the same types.
 */
const INFO: ViewerSchemaInfo = {
  blocks: {
    paragraph: {},
    heading: { level: { default: 1 } },
    bulletListItem: {},
    numberedListItem: {},
    quote: {},
    codeBlock: { language: { default: "text" } },
    table: {},
    image: { url: { default: "" }, caption: { default: "" } },
    mermaid: { code: { default: "" } },
    callout: { calloutType: { default: "note", values: ["note", "info", "tip", "warning", "error"] } },
    fileAsset: { assetId: { default: "" }, name: { default: "" } },
    drawio: { pngAssetId: { default: "" }, sourceAssetId: { default: "" } },
    wrappedImage: {
      url: { default: "" },
      caption: { default: "" },
      side: { default: "left", values: ["left", "right"] },
      widthPercent: { default: 40 },
    },
  },
  inlines: {
    text: "text",
    link: "link",
    mention: { userId: { default: "" }, name: { default: "" } },
    anchor: { url: { default: "" }, kind: { default: "link" }, title: { default: "" } },
  },
};

const text = (t: string) => ({ type: "text", text: t, styles: {} });

describe("normalizeDocument — crash guard", () => {
  it("replaces a fabricated FUTURE block type with a neutral paragraph, preserving inline text and children", () => {
    const doc = [
      {
        id: "b1",
        type: "holographicTimeline", // does not exist in any schema version
        props: { era: "future", intensity: 11 },
        content: [text("The future "), { type: "mention", props: { userId: "u1", name: "Ada" } }],
        children: [
          { id: "b2", type: "paragraph", props: {}, content: [text("child survives")], children: [] },
        ],
      },
    ];
    const out = normalizeDocument(doc, INFO);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("paragraph");
    expect(out[0].id).toBe("b1");
    expect(out[0].props).toEqual({}); // unknown props do not leak onto the paragraph
    // Inline content preserved — including the KNOWN custom inline inside it.
    expect(out[0].content).toEqual([
      text("The future "),
      { type: "mention", props: { userId: "u1", name: "Ada" } },
    ]);
    const children = out[0].children as Array<Record<string, unknown>>;
    expect(children).toHaveLength(1);
    expect(children[0].type).toBe("paragraph");
  });

  it("degrades an unknown INLINE type to its plain text", () => {
    const doc = [
      {
        type: "paragraph",
        content: [
          text("see "),
          { type: "objectHologram", props: { title: "Workbook X", objectId: "123" } },
        ],
      },
    ];
    const out = normalizeDocument(doc, INFO);
    expect(out[0].content).toEqual([text("see "), text("Workbook X")]);
  });

  it("drops an unknown inline type with no recoverable text instead of crashing", () => {
    const doc = [{ type: "paragraph", content: [{ type: "voidGlyph", props: { magnitude: 3 } }] }];
    const out = normalizeDocument(doc, INFO);
    expect(out[0].content).toEqual([]);
  });

  it("keeps known custom blocks and their props verbatim", () => {
    const doc = [
      { type: "callout", props: { calloutType: "warning" }, content: [text("careful")] },
      { type: "drawio", props: { pngAssetId: "a".repeat(24), sourceAssetId: "b".repeat(24) } },
      { type: "mermaid", props: { code: "graph TD; A-->B;" } },
    ];
    const out = normalizeDocument(doc, INFO);
    expect(out[0]).toMatchObject({ type: "callout", props: { calloutType: "warning" } });
    expect(out[1]).toMatchObject({
      type: "drawio",
      props: { pngAssetId: "a".repeat(24), sourceAssetId: "b".repeat(24) },
    });
    expect(out[2]).toMatchObject({ type: "mermaid", props: { code: "graph TD; A-->B;" } });
  });

  it("drops UNKNOWN props on known types (future prop additions can't crash old viewers)", () => {
    const doc = [
      { type: "heading", props: { level: 2, isToggleable: false, futureProp: "x" }, content: [text("H")] },
    ];
    const out = normalizeDocument(doc, INFO);
    expect(out[0].props).toEqual({ level: 2 });
  });

  it("drops enum props whose value is outside the known set (falls back to the default)", () => {
    const doc = [
      { type: "callout", props: { calloutType: "sparkly-new-type" }, content: [text("hi")] },
    ];
    const out = normalizeDocument(doc, INFO);
    expect(out[0].props).toEqual({}); // calloutType dropped → schema default ('note') applies
  });

  it("normalizes inline content inside table cells", () => {
    const doc = [
      {
        type: "table",
        content: {
          type: "tableContent",
          rows: [
            {
              cells: [
                [text("plain")],
                { type: "tableCell", content: [{ type: "wormhole", props: { label: "far" } }], props: {} },
              ],
            },
          ],
        },
      },
    ];
    const out = normalizeDocument(doc, INFO);
    const content = out[0].content as { rows: Array<{ cells: unknown[] }> };
    expect(content.rows[0].cells[0]).toEqual([text("plain")]);
    expect(content.rows[0].cells[1]).toMatchObject({ type: "tableCell", content: [text("far")] });
  });

  it("never throws on garbage input", () => {
    expect(normalizeDocument(null, INFO)).toEqual([]);
    expect(normalizeDocument("nope", INFO)).toEqual([]);
    expect(normalizeDocument([null, 42, "str", {}, { type: 7 }], INFO)).toEqual([
      { type: "paragraph", props: {}, content: [], children: [] },
      { type: "paragraph", props: {}, content: [], children: [] },
    ]);
  });

  it("survives pathological nesting (depth cap truncates, no stack overflow)", () => {
    let doc: Record<string, unknown> = { type: "paragraph", content: [text("deep")], children: [] };
    for (let i = 0; i < 500; i++) {
      doc = { type: "paragraph", content: [], children: [doc] };
    }
    expect(() => normalizeDocument([doc], INFO)).not.toThrow();
  });

  it("keeps links and degrades their exotic children to text", () => {
    const doc = [
      {
        type: "paragraph",
        content: [
          { type: "link", href: "https://example.com", content: [text("site"), { type: "shiny", props: { text: "!" } }] },
        ],
      },
    ];
    const out = normalizeDocument(doc, INFO);
    expect(out[0].content).toEqual([
      { type: "link", href: "https://example.com", content: [text("site"), text("!")] },
    ]);
  });
});

describe("documentPlainText / inlineContentPlainText", () => {
  it("extracts plain text across blocks, children, and custom inlines", () => {
    const doc = [
      {
        type: "unknownFutureBlock",
        content: [text("Hello "), { type: "mention", props: { userId: "u", name: "Grace" } }],
        children: [{ type: "paragraph", content: [text("nested")] }],
      },
    ];
    expect(inlineContentPlainText(doc[0].content)).toBe("Hello @Grace");
    expect(documentPlainText(doc)).toBe("Hello @Grace\nnested");
  });
});
