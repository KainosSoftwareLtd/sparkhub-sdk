/* eslint-disable @typescript-eslint/no-explicit-any -- BlockNote's deeply-generic
   block/inline types add no safety to a structural tree-walk; we narrow by
   `type` at runtime instead. */

/**
 * SparkMD serializer — the id-annotated markdown **read view** handed to the
 * agent (`kb_read_page`). NOT the stored format (that's BlockNote JSON).
 *
 * Rules (see docs/Vibe-Coding-Planning/block-editor-sparkmd-dialect-plan.md):
 *  - Each TOP-LEVEL block is preceded by `<!-- blk:<id> -->`. Nested children
 *    (sub-list items, quote children) are serialized inline under their parent
 *    and are NOT independently anchored (top-level granularity, v1).
 *  - Authorable blocks round-trip as native markdown / fences; reference blocks
 *    (image/drawio/embed) become opaque tokens; mentions/object-links become
 *    inline tokens.
 *  - Text color/background is intentionally dropped (lossy, accepted).
 *
 * The inverse (`sparkMDToBlocks`) and the op applier (`kb_apply_edits`) are
 * built next; this half exists first so the read view is visible/testable.
 */

/**
 * Options controlling a markdown projection. Both fields are optional; the
 * defaults reproduce the original SparkMD agent-view output exactly.
 */
export interface MarkdownProjectionOptions {
  /** Prefix each TOP-LEVEL block with `<!-- blk:<id> -->`. Default false. */
  blockIds?: boolean;
  /**
   * How to render an inline `mention` node. Default is the SparkMD agent token
   * `@[name](user:id)`. Surfaces with their own mention convention (e.g. the
   * collaboration `@{id:name}` token, or a human-readable `@name`) pass their
   * own renderer here so the projection speaks their dialect.
   */
  renderMention?: (userId: string, name: string) => string;
}

const defaultRenderMention = (userId: string, name: string): string =>
  `@[${name}](user:${userId})`;

function applyTextStyles(text: string, styles: any): string {
  if (!styles) return text;
  let t = text;
  // code first (innermost), then emphasis wrappers
  if (styles.code) t = '`' + t + '`';
  if (styles.bold) t = '**' + t + '**';
  if (styles.italic) t = '*' + t + '*';
  if (styles.strike) t = '~~' + t + '~~';
  if (styles.underline) t = '<u>' + t + '</u>';
  return t;
}

/** Serialize an inline-content array to markdown (text styles, links, mentions). */
/**
 * Scheme-guard for a URL emitted into a projected markdown link. Returns the
 * URL when safe, or null to signal "drop the link, keep the text". Blocks
 * script-capable schemes (`javascript:`, `data:`, `vbscript:`, …) so a
 * hand-crafted stored document can never smuggle an XSS payload to consumers
 * that bypass the client renderer — Teams mirror, MCP, notification previews.
 * Allows http(s), mailto, and scheme-less / relative URLs. Mirrors the
 * render-time `safeHref` guard in `inline/AnchorLink.tsx` (defence in depth).
 */
function safeProjectionUrl(raw: any): string | null {
  const url = String(raw ?? '').trim();
  if (!url) return null;
  // The scheme is tested on a control-character-stripped copy: the HTML URL
  // parser removes ASCII tab/LF/CR (and leading C0 controls) BEFORE resolving
  // the scheme, so `"java\tscript:alert(1)"` navigates as `javascript:` even
  // though a naive regex sees no scheme (collab-ui v0.1 Opus review, 2026-08-19
  // — this guard and the packaged renderer's copy get the same fix).
  // eslint-disable-next-line no-control-regex -- deliberately mirrors the HTML URL parser's pre-strip
  const schemeProbe = url.replace(/[\u0000-\u0020]/g, '');
  const scheme = schemeProbe.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme && scheme !== 'http' && scheme !== 'https' && scheme !== 'mailto') return null;
  return url;
}

function inlineToMarkdown(content: any, opts: MarkdownProjectionOptions = {}): string {
  if (!Array.isArray(content)) return '';
  const renderMention = opts.renderMention ?? defaultRenderMention;
  return content
    .map((node) => {
      switch (node?.type) {
        case 'text':
          return applyTextStyles(node.text ?? '', node.styles);
        case 'link': {
          const text = inlineToMarkdown(node.content ?? [], opts);
          const href = safeProjectionUrl(node.href);
          // Unsafe scheme → drop the link, keep the visible text.
          return href ? `[${text}](${href})` : text;
        }
        case 'mention':
          return renderMention(node.props?.userId ?? '', node.props?.name ?? '');
        case 'anchor': {
          // Typed URL anchor → plain markdown link for the projection (the
          // kind/title round-trip lives in the stored JSON, not the markdown).
          const title = String(node.props?.title || node.props?.url || '');
          const url = safeProjectionUrl(node.props?.url);
          return url ? `[${title}](${url})` : title;
        }
        case 'sparkObjectLink':
          return `[${node.props?.label ?? ''}](spark:${node.props?.kind ?? ''}:${node.props?.objectId ?? ''})`;
        default:
          return '';
      }
    })
    .join('');
}

/** Plain text of an inline-content array (no markdown styling) — for code blocks. */
function inlinePlainText(content: any): string {
  if (!Array.isArray(content)) return '';
  return content.map((n) => (n?.type === 'text' ? (n.text ?? '') : '')).join('');
}

function tableCellToMarkdown(cell: any, opts: MarkdownProjectionOptions = {}): string {
  // Cells may be a raw inline array or a { content } wrapper depending on version.
  const inline = Array.isArray(cell) ? cell : (cell?.content ?? []);
  return inlineToMarkdown(inline, opts).trim();
}

/** Plain text of a table cell — no markdown styling (for the search `body`). */
function tableCellPlainText(cell: any): string {
  const inline = Array.isArray(cell) ? cell : (cell?.content ?? []);
  return inlinePlainText(inline).trim();
}

function tableToMarkdown(content: any, opts: MarkdownProjectionOptions = {}): string {
  const rows: any[] = content?.rows ?? [];
  if (rows.length === 0) return '';
  const headerCells: string[] = (rows[0].cells ?? []).map((c: any) => tableCellToMarkdown(c, opts));
  const header = `| ${headerCells.join(' | ')} |`;
  const sep = `| ${headerCells.map(() => '---').join(' | ')} |`;
  const body = rows
    .slice(1)
    .map((r) => `| ${(r.cells ?? []).map((c: any) => tableCellToMarkdown(c, opts)).join(' | ')} |`);
  return [header, sep, ...body].join('\n');
}

/** Serialize a single block (without its anchor) to markdown. */
function blockBodyToMarkdown(block: any, opts: MarkdownProjectionOptions = {}): string {
  const content = block.content;
  const text = inlineToMarkdown(content, opts);
  switch (block.type) {
    case 'heading':
      return `${'#'.repeat(Math.min(Math.max(block.props?.level ?? 1, 1), 3))} ${text}`;
    case 'paragraph':
      return text;
    case 'bulletListItem':
      return `- ${text}`;
    case 'numberedListItem':
      return `1. ${text}`;
    case 'checkListItem':
      return `${block.props?.checked ? '- [x] ' : '- [ ] '}${text}`;
    case 'quote':
      return `> ${text}`;
    case 'codeBlock':
      return `\`\`\`${block.props?.language ?? ''}\n${inlinePlainText(content)}\n\`\`\``;
    case 'mermaid':
      return `\`\`\`mermaid\n${block.props?.code ?? ''}\n\`\`\``;
    case 'callout':
      // GFM-style admonition: `> [!WARNING] text`
      return `> [!${String(block.props?.calloutType ?? 'note').toUpperCase()}] ${text}`;
    case 'table':
      return tableToMarkdown(content, opts);
    case 'image':
      // Production form will be `asset:<id>`; today the default block carries a url.
      return `![${block.props?.caption || block.props?.name || ''}](${block.props?.assetId ? `asset:${block.props.assetId}` : (block.props?.url ?? '')})`;
    case 'wrappedImage':
      // SIMPLE, NO-HTML projection (approved decision): a normal image line
      // followed by the block's inline text. `side`/`widthPercent` are NOT
      // representable in markdown and are intentionally dropped here — the
      // apply-edits `update` op path (`block-ops.ts`) is what preserves them
      // across an agent edit, by reading them off the EXISTING stored block
      // rather than round-tripping them through this projection.
      return `![${block.props?.caption || ''}](${block.props?.url ?? ''})\n${text}`;
    case 'drawio': {
      // Two-asset diagram (#1128 Phase 1b; render reworked #1278): the embedded
      // half is the RENDER asset — the SVG render (#1278) if present, else the
      // legacy PNG render for un-resaved diagrams. Project it as a normal image
      // reference so published/search/Teams-mirror consumers see an actual
      // image, not an opaque token. The `sourceAssetId` (the editable mxGraph
      // XML) is intentionally NOT projected (it's never displayed, and must
      // stay un-servable on the public/guest surfaces).
      const renderId = block.props?.svgAssetId || block.props?.pngAssetId || '';
      // CB-10: the org-scope KB asset-serve route moved to `/kb/api/assets`.
      // Literal (not `blockEditorApiBases()`) because this projection runs
      // server-side where the host app's boot-time config may not have run;
      // `knowledge-base/lib/asset-refs.ts` matches BOTH forms, so bodies
      // written before the flip keep resolving.
      return renderId ? `![diagram](/kb/api/assets/${renderId})` : '<!-- drawio: (no render) -->';
    }
    case 'fileAsset':
      return `<!-- file-asset:${block.props?.assetId ?? ''} -->`;
    case 'embed':
      return `<!-- embed:${block.props?.url ?? ''} -->`;
    default:
      return text;
  }
}

/**
 * Hard ceiling on nested-block recursion across every walk in this module.
 * BlockNote nesting is realistically <10 deep; this guards a pathological or
 * malicious document (deeply self-nested `children`) from blowing the call
 * stack. Past the ceiling we stop descending — projections truncate, not crash.
 */
const MAX_BLOCK_DEPTH = 50;

/** Render a block plus any nested children (children indented, not anchored). */
function renderBlock(block: any, depth: number, opts: MarkdownProjectionOptions = {}): string {
  if (depth > MAX_BLOCK_DEPTH) return '';
  const indent = '  '.repeat(depth);
  const lines = blockBodyToMarkdown(block, opts)
    .split('\n')
    .map((line) => indent + line)
    .join('\n');
  const children: any[] = block.children ?? [];
  if (children.length === 0) return lines;
  const childMd = children.map((c) => renderBlock(c, depth + 1, opts)).join('\n');
  return `${lines}\n${childMd}`;
}

/**
 * Serialize a BlockNote document to markdown. The single projection primitive
 * shared by every surface — `opts` selects the dialect:
 *   - `blockIds: true` prefixes each top-level block with `<!-- blk:id -->`
 *     (the SparkMD agent read view).
 *   - `renderMention` controls how inline `@mention` nodes serialize (default
 *     `@[name](user:id)`; collaboration passes its `@{id:name}` token, etc.).
 *
 * Pure — no BlockNote/DOM/React dependency, so it is safe to call from a
 * server route (unlike `blocksToMarkdownLossy`, which needs the live editor /
 * `@blocknote/server-util`).
 */
export function blocksToMarkdown(blocks: any, opts: MarkdownProjectionOptions = {}): string {
  if (!Array.isArray(blocks)) return '';
  return blocks
    .map((block) =>
      opts.blockIds
        ? `<!-- blk:${block.id} -->\n${renderBlock(block, 0, opts)}`
        : renderBlock(block, 0, opts),
    )
    .join('\n\n');
}

/**
 * Serialize a BlockNote document to SparkMD — the agent read view. Each
 * top-level block is preceded by its `<!-- blk:id -->` anchor. Thin wrapper
 * over `blocksToMarkdown` preserving the original agent-view output.
 */
export function blocksToSparkMD(blocks: any): string {
  return blocksToMarkdown(blocks, { blockIds: true });
}

/**
 * Pure walk collecting the `userId` of every inline `@mention` node (top-level
 * blocks, table cells, and nested children). Deduped, insertion order. Replaces
 * the markdown-regex `parseMentions` on JSON-native surfaces — mentions carry a
 * structured `userId` so there is no token to re-parse.
 */
export function extractMentionUserIds(blocks: any): string[] {
  const seen = new Set<string>();
  const scanInline = (content: any): void => {
    if (!Array.isArray(content)) return;
    for (const node of content) {
      if (node?.type === 'mention' && node.props?.userId) {
        seen.add(String(node.props.userId));
      }
    }
  };
  const walk = (bs: any[], depth: number): void => {
    if (depth > MAX_BLOCK_DEPTH) return;
    for (const b of bs ?? []) {
      scanInline(b.content);
      if (b.type === 'table') {
        for (const row of b.content?.rows ?? []) {
          for (const cell of row.cells ?? []) {
            scanInline(Array.isArray(cell) ? cell : cell?.content);
          }
        }
      }
      if (Array.isArray(b.children)) walk(b.children, depth + 1);
    }
  };
  if (Array.isArray(blocks)) walk(blocks, 0);
  return [...seen];
}

/** A typed URL anchor extracted from a document's inline content. */
export interface ExtractedAnchor {
  url: string;
  kind: string;
  title: string;
}

/**
 * Pure walk collecting every inline `anchor` node (top-level blocks, table
 * cells, nested children), deduped by URL. Drives the auto-sync of SparkHub
 * anchors in a body/description into the conversation's subject set.
 */
export function extractAnchors(blocks: any): ExtractedAnchor[] {
  const byUrl = new Map<string, ExtractedAnchor>();
  const scanInline = (content: any): void => {
    if (!Array.isArray(content)) return;
    for (const node of content) {
      if (node?.type === 'anchor' && node.props?.url) {
        const url = String(node.props.url);
        if (!byUrl.has(url)) {
          byUrl.set(url, {
            url,
            kind: String(node.props.kind ?? 'link'),
            title: String(node.props.title ?? ''),
          });
        }
      }
    }
  };
  const walk = (bs: any[], depth: number): void => {
    if (depth > MAX_BLOCK_DEPTH) return;
    for (const b of bs ?? []) {
      scanInline(b.content);
      if (b.type === 'table') {
        for (const row of b.content?.rows ?? []) {
          for (const cell of row.cells ?? []) {
            scanInline(Array.isArray(cell) ? cell : cell?.content);
          }
        }
      }
      if (Array.isArray(b.children)) walk(b.children, depth + 1);
    }
  };
  if (Array.isArray(blocks)) walk(blocks, 0);
  return [...byUrl.values()];
}

/**
 * Returns a copy of the document with every inline `anchor`/`link` URL that
 * fails the scheme guard neutralized — an unsafe `anchor` degrades to a plain
 * text node, an unsafe `link` unwraps to its inline children (href dropped).
 *
 * Run at the WRITE boundary (the content zod schemas) so a hand-crafted
 * `content` POST that bypasses the paste resolver can never persist a
 * `javascript:`/`data:` URL into the DB — a guarantee the read-time projection
 * guard can't give for some future consumer that reads raw stored JSON.
 */
export function sanitizeBlockDocumentUrls<T>(blocks: T): T {
  if (!Array.isArray(blocks)) return blocks;
  const sanitizeInline = (content: any): any => {
    if (!Array.isArray(content)) return content;
    return content
      .map((node) => {
        if (node?.type === 'anchor' && !safeProjectionUrl(node.props?.url)) {
          const text = String(node.props?.title || node.props?.url || '');
          return { type: 'text', text, styles: {} };
        }
        if (node?.type === 'link' && !safeProjectionUrl(node.href)) {
          return Array.isArray(node.content) ? node.content : { type: 'text', text: '', styles: {} };
        }
        return node;
      })
      .flat();
  };
  const sanitizeCells = (content: any): any =>
    content?.rows
      ? {
          ...content,
          rows: content.rows.map((row: any) => ({
            ...row,
            cells: (row.cells ?? []).map((cell: any) =>
              Array.isArray(cell) ? sanitizeInline(cell) : { ...cell, content: sanitizeInline(cell?.content) },
            ),
          })),
        }
      : content;
  const walk = (bs: any[], depth: number): any[] => {
    // SECURITY: this is the write-boundary sanitizer — past the depth ceiling we
    // TRUNCATE (return []), never pass the raw subtree through. Returning `bs`
    // here would let a 51+-level-nested document smuggle a javascript: URL past
    // the guard. (Read-side walks may return early harmlessly; this one must not.)
    if (depth > MAX_BLOCK_DEPTH) return [];
    return bs.map((b) => {
      const next: any = { ...b };
      if (Array.isArray(b.content)) next.content = sanitizeInline(b.content);
      else if (b.type === 'table') next.content = sanitizeCells(b.content);
      if (Array.isArray(b.children)) next.children = walk(b.children, depth + 1);
      return next;
    });
  };
  return walk(blocks as any[], 0) as unknown as T;
}

const MEDIA_BLOCK_TYPES = new Set(['image', 'wrappedImage', 'drawio', 'embed', 'video', 'audio', 'file', 'fileAsset']);

/**
 * True when a BlockNote document carries no meaningful content — no text (per
 * `blocksToPlainText`) AND no media/embed block. Replaces `sanitizeMarkdown`'s
 * empty-string reject for JSON-native surfaces (an image-only message is NOT
 * empty, so a plain-text check alone would wrongly reject it).
 */
const MEANINGFUL_INLINE_TYPES = new Set(['mention', 'anchor', 'link', 'sparkObjectLink']);

export function isBlockDocumentEmpty(blocks: any): boolean {
  if (!Array.isArray(blocks) || blocks.length === 0) return true;
  if (blocksToPlainText(blocks).trim().length > 0) return false;
  let hasContent = false;
  const scanInline = (content: any): void => {
    if (!Array.isArray(content)) return;
    for (const node of content) {
      if (MEANINGFUL_INLINE_TYPES.has(node?.type)) hasContent = true;
    }
  };
  const walk = (bs: any[], depth: number): void => {
    if (depth > MAX_BLOCK_DEPTH) return;
    for (const b of bs ?? []) {
      // A media/embed block, or an inline mention/anchor/link, makes a doc
      // non-empty even when it carries no plain text.
      if (MEDIA_BLOCK_TYPES.has(b.type)) hasContent = true;
      scanInline(b.content);
      if (b.type === 'table') {
        for (const row of b.content?.rows ?? []) {
          for (const cell of row.cells ?? []) scanInline(Array.isArray(cell) ? cell : cell?.content);
        }
      }
      if (Array.isArray(b.children)) walk(b.children, depth + 1);
    }
  };
  walk(blocks, 0);
  return !hasContent;
}

/**
 * Pure plain-text projection of a BlockNote document — for the search `body`.
 * No BlockNote/DOM/React dependency, so it is safe to call from a server route
 * (unlike `blocksToMarkdownLossy`, which needs `@blocknote/server-util`).
 */
export function blocksToPlainText(blocks: any): string {
  if (!Array.isArray(blocks)) return '';
  const lines: string[] = [];
  const walk = (bs: any[], depth: number): void => {
    if (depth > MAX_BLOCK_DEPTH) return;
    for (const b of bs) {
      if (Array.isArray(b.content)) {
        const t = inlinePlainText(b.content);
        if (t) lines.push(t);
      } else if (b.type === 'mermaid' && b.props?.code) {
        lines.push(b.props.code);
      } else if (b.type === 'table') {
        for (const row of b.content?.rows ?? []) {
          lines.push((row.cells ?? []).map(tableCellPlainText).join(' '));
        }
      }
      if (Array.isArray(b.children)) walk(b.children, depth + 1);
    }
  };
  walk(blocks, 0);
  return lines.join('\n');
}

// ── SparkMD → blocks (parser) ──────────────────────────────────────────────
//
// BlockNote's markdown parser flattens custom inline tokens (it drops
// `@[name](user:id)` to plain text) and has no notion of our mermaid/anchor
// conventions. So the parser is: strip anchors → protect custom inline tokens
// behind placeholders → run BlockNote's markdown parse (injected) → transform
// code fences to custom blocks → re-inject the protected inline tokens.
//
// `parseMarkdown` is injected (BlockNote needs a DOM): `@blocknote/server-util`
// on the server, the live editor on the client. Keeping it injected leaves this
// module pure + unit-testable.

const ANCHOR_LINE_RE = /^[ \t]*<!--\s*blk:[^>]*-->[ \t]*\n?/gm;
const MENTION_RE = /@\[([^\]]*)\]\(user:([^)]+)\)/g;
const PLACEHOLDER_RE = /%%SMD(\d+)%%/g;

interface ProtectedToken {
  type: 'mention';
  props: { userId: string; name: string };
}

/** Remove `<!-- blk:id -->` anchors and protect custom inline tokens. */
function protectInlineTokens(markdown: string): { md: string; tokens: ProtectedToken[] } {
  const tokens: ProtectedToken[] = [];
  const stripped = markdown.replace(ANCHOR_LINE_RE, '');
  const md = stripped.replace(MENTION_RE, (_m, name: string, userId: string) => {
    const i = tokens.length;
    tokens.push({ type: 'mention', props: { userId, name } });
    return `%%SMD${i}%%`;
  });
  return { md, tokens };
}

/** Code fence with `mermaid` info-string → mermaid block. Recurses children. */
function transformCustomBlocks(blocks: any[]): any[] {
  for (const block of blocks) {
    if (block.type === 'codeBlock' && block.props?.language === 'mermaid') {
      block.type = 'mermaid';
      block.props = { code: inlinePlainText(block.content) };
      block.content = undefined;
    }
    if (Array.isArray(block.children)) transformCustomBlocks(block.children);
  }
  return blocks;
}

/** Split a text node on `%%SMDn%%` placeholders, interleaving the saved tokens. */
function splitTextNode(node: any, tokens: ProtectedToken[]): any[] {
  const out: any[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  PLACEHOLDER_RE.lastIndex = 0;
  while ((m = PLACEHOLDER_RE.exec(node.text)) !== null) {
    if (m.index > last) out.push({ ...node, text: node.text.slice(last, m.index) });
    const tok = tokens[Number(m[1])];
    if (tok) out.push({ type: tok.type, props: tok.props });
    last = m.index + m[0].length;
  }
  if (last < node.text.length) out.push({ ...node, text: node.text.slice(last) });
  return out;
}

/** Re-inject protected inline tokens into parsed blocks. Recurses children. */
function reinjectInlineTokens(blocks: any[], tokens: ProtectedToken[]): any[] {
  for (const block of blocks) {
    if (Array.isArray(block.content)) {
      block.content = block.content.flatMap((node: any) =>
        node?.type === 'text' && typeof node.text === 'string' && node.text.includes('%%SMD')
          ? splitTextNode(node, tokens)
          : [node],
      );
    }
    if (Array.isArray(block.children)) reinjectInlineTokens(block.children, tokens);
  }
  return blocks;
}

/**
 * Parse a SparkMD fragment (or full read view) into BlockNote blocks.
 * `parseMarkdown` runs BlockNote's DOM-bound markdown parse (server-util /
 * client editor). Returns blocks with fresh ids — id preservation is the op
 * applier's job, never the markdown round-trip's.
 */
export async function sparkMDToBlocks(
  markdown: string,
  parseMarkdown: (md: string) => any[] | Promise<any[]>,
): Promise<any[]> {
  const { md, tokens } = protectInlineTokens(markdown);
  const parsed = await parseMarkdown(md);
  return reinjectInlineTokens(transformCustomBlocks(parsed), tokens);
}
