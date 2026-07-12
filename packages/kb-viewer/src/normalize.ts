/**
 * Document normalizer — the viewer's crash guard.
 *
 * SparkHub's block set grows over time; a page served by the public KB API may
 * contain block or inline-content types this viewer version doesn't know yet
 * (or props added after this version shipped). BlockNote throws on unknown
 * types, which would blank the whole page in a partner app — so the incoming
 * document is normalized BEFORE it ever reaches the editor:
 *
 *   - unknown BLOCK types    → neutral `paragraph` (inline text + children preserved)
 *   - unknown INLINE types   → their plain text
 *   - unknown props on known types → dropped (schema defaults apply)
 *   - enum props with out-of-range values → dropped (falls back to the default)
 *
 * Pure module — no React, no BlockNote imports — so it's unit-testable in a
 * plain node environment and reusable server-side.
 */

/** One entry of a BlockNote `propSchema` (the subset the normalizer needs). */
export interface PropSpecEntry {
  default?: unknown;
  values?: readonly unknown[];
}

export type PropSchemaLike = Record<string, PropSpecEntry>;

/** What the normalizer needs to know about the viewer schema. */
export interface ViewerSchemaInfo {
  /** block type → its propSchema */
  blocks: Record<string, PropSchemaLike>;
  /** inline type → its propSchema (`"text"`/`"link"` for the built-ins) */
  inlines: Record<string, PropSchemaLike | "text" | "link">;
}

/** Same recursion ceiling the SparkHub projections use — truncate, don't crash. */
const MAX_DEPTH = 50;

type AnyRecord = Record<string, unknown>;

function isRecord(v: unknown): v is AnyRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Common prop keys that plausibly carry human-readable text on future types. */
const TEXTY_PROP_KEYS = ["text", "title", "name", "label", "caption", "alt"] as const;

/** Best-effort plain text of ONE inline-content node (any shape). */
export function inlineNodePlainText(node: unknown): string {
  if (typeof node === "string") return node;
  if (!isRecord(node)) return "";
  if (typeof node.text === "string") return node.text;
  if (Array.isArray(node.content)) {
    return node.content.map(inlineNodePlainText).join("");
  }
  const props = isRecord(node.props) ? node.props : undefined;
  if (props) {
    for (const key of TEXTY_PROP_KEYS) {
      const v = props[key];
      if (typeof v === "string" && v) {
        // A mention-like node reads better with its sigil.
        return node.type === "mention" && key === "name" ? `@${v}` : v;
      }
    }
    if (typeof props.url === "string" && props.url) return props.url;
  }
  return "";
}

/** Plain text of an inline-content array. */
export function inlineContentPlainText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map(inlineNodePlainText).join("");
}

/** Keep only props the spec knows; drop enum values outside the allowed set. */
function sanitizeProps(props: unknown, propSchema: PropSchemaLike): AnyRecord {
  if (!isRecord(props)) return {};
  const out: AnyRecord = {};
  for (const [key, spec] of Object.entries(propSchema)) {
    if (!(key in props)) continue;
    const value = props[key];
    if (value === undefined) continue;
    if (spec.values && !spec.values.includes(value)) continue; // out-of-range enum → default
    out[key] = value;
  }
  return out;
}

/** A plain styled-text node. */
function textNode(text: string, styles?: unknown): AnyRecord {
  return { type: "text", text, styles: isRecord(styles) ? styles : {} };
}

/** Normalize ONE inline-content node against the schema, or degrade to text. */
function normalizeInlineNode(node: unknown, info: ViewerSchemaInfo): AnyRecord | null {
  if (typeof node === "string") return node ? textNode(node) : null;
  if (!isRecord(node)) return null;
  const type = typeof node.type === "string" ? node.type : "text";

  if (type === "text") {
    return textNode(typeof node.text === "string" ? node.text : "", node.styles);
  }
  if (type === "link" && "link" in info.inlines) {
    const inner = Array.isArray(node.content)
      ? node.content
          .map((c) => normalizeInlineNode(c, info))
          .filter((c): c is AnyRecord => c !== null && c.type === "text")
      : [];
    const href = typeof node.href === "string" ? node.href : "";
    if (inner.length === 0) inner.push(textNode(href));
    return { type: "link", href, content: inner };
  }

  const spec = info.inlines[type];
  if (spec && spec !== "text" && spec !== "link") {
    return { type, props: sanitizeProps(node.props, spec) };
  }

  // Unknown inline type → its plain text (dropped entirely when empty).
  const text = inlineNodePlainText(node);
  return text ? textNode(text) : null;
}

function normalizeInlineContent(content: unknown, info: ViewerSchemaInfo): AnyRecord[] {
  if (typeof content === "string") return content ? [textNode(content)] : [];
  if (!Array.isArray(content)) return [];
  return content
    .map((node) => normalizeInlineNode(node, info))
    .filter((node): node is AnyRecord => node !== null);
}

/** Normalize BlockNote table content (rows of cells of inline content). */
function normalizeTableContent(content: AnyRecord, info: ViewerSchemaInfo): AnyRecord {
  const rows = Array.isArray(content.rows) ? content.rows : [];
  return {
    ...content,
    type: "tableContent",
    rows: rows.filter(isRecord).map((row) => ({
      ...row,
      cells: (Array.isArray(row.cells) ? row.cells : []).map((cell: unknown) => {
        // Cells are either bare inline arrays or `{ type: 'tableCell', content, props }`.
        if (isRecord(cell) && cell.type === "tableCell") {
          return { ...cell, content: normalizeInlineContent(cell.content, info) };
        }
        return normalizeInlineContent(cell, info);
      }),
    })),
  };
}

function normalizeBlock(block: unknown, info: ViewerSchemaInfo, depth: number): AnyRecord | null {
  if (!isRecord(block)) return null;
  const id = typeof block.id === "string" ? block.id : undefined;
  const children =
    depth < MAX_DEPTH && Array.isArray(block.children)
      ? normalizeBlockArray(block.children, info, depth + 1)
      : [];

  const type = typeof block.type === "string" ? block.type : "";
  const propSchema = type ? info.blocks[type] : undefined;

  if (!propSchema) {
    // Unknown (future) block type → neutral paragraph: inline text preserved
    // (flattened to plain text when the shape is exotic), children preserved.
    const content = Array.isArray(block.content)
      ? normalizeInlineContent(block.content, info)
      : (() => {
          const text = inlineContentPlainText(
            isRecord(block.content) ? (block.content as AnyRecord).rows ?? "" : block.content,
          );
          return text ? [textNode(text)] : [];
        })();
    return { ...(id ? { id } : {}), type: "paragraph", props: {}, content, children };
  }

  const out: AnyRecord = {
    ...(id ? { id } : {}),
    type,
    props: sanitizeProps(block.props, propSchema),
    children,
  };
  if (Array.isArray(block.content)) {
    out.content = normalizeInlineContent(block.content, info);
  } else if (isRecord(block.content) && block.content.type === "tableContent") {
    out.content = normalizeTableContent(block.content, info);
  }
  return out;
}

function normalizeBlockArray(blocks: unknown[], info: ViewerSchemaInfo, depth: number): AnyRecord[] {
  return blocks
    .map((b) => normalizeBlock(b, info, depth))
    .filter((b): b is AnyRecord => b !== null);
}

/**
 * Normalize a raw `content` array (from the public KB API) into a document
 * that is guaranteed representable in the viewer schema. Never throws; always
 * returns an array (empty for garbage input).
 */
export function normalizeDocument(content: unknown, info: ViewerSchemaInfo): AnyRecord[] {
  try {
    if (!Array.isArray(content)) return [];
    return normalizeBlockArray(content, info, 0);
  } catch {
    return [];
  }
}

/** Whole-document plain text — the error-boundary fallback rendering. */
export function documentPlainText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return "";
  const lines: string[] = [];
  const walk = (arr: unknown[], depth: number): void => {
    if (depth > MAX_DEPTH) return;
    for (const b of arr) {
      if (!isRecord(b)) continue;
      const text = Array.isArray(b.content)
        ? inlineContentPlainText(b.content)
        : inlineContentPlainText(b.content ?? "");
      if (text) lines.push(text);
      if (Array.isArray(b.children)) walk(b.children, depth + 1);
    }
  };
  walk(blocks, 0);
  return lines.join("\n");
}
