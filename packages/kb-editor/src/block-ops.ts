/* eslint-disable @typescript-eslint/no-explicit-any -- operates structurally on
   BlockNote JSON blocks; `type` is narrowed at runtime. */

/**
 * Id-addressed block operations — the core of `kb_apply_edits`.
 *
 * This is deliberately **pure tree manipulation over BlockNote JSON** with the
 * markdown→blocks parser **injected** (`parseFragment`). That separation is
 * what lets the id-preservation guarantee be unit-tested with no DOM, while the
 * real parser (client editor, or `@blocknote/server-util` on the server) plugs
 * in unchanged.
 *
 * Spec: docs/Vibe-Coding-Planning/block-editor-sparkmd-dialect-plan.md
 *
 * Granularity is the **top-level block** (decision #1): ops address top-level
 * blocks by id; nested children ride inside their parent's fragment.
 */

export type BlockOp =
  | { op: 'update'; id: string; markdown: string }
  | { op: 'insertAfter'; id: string; markdown: string }
  | { op: 'insertBefore'; id: string; markdown: string }
  | { op: 'appendToEnd'; markdown: string }
  | { op: 'move'; id: string; after?: string; before?: string }
  | { op: 'delete'; id: string };

/** Parses a SparkMD fragment into one or more BlockNote blocks (with fresh ids). */
export type ParseFragment = (markdown: string) => any[];

export interface ApplyResult {
  doc: any[];
  /** Per-op problems (id not found, multi-block update, etc.). */
  errors: string[];
}

const indexOfId = (doc: any[], id: string): number => doc.findIndex((b) => b?.id === id);

/**
 * `wrappedImage`'s SparkMD projection (`sparkmd.ts`) is a plain image line
 * (`![caption](url)`) followed by the block's inline text — `side` and
 * `widthPercent` are NOT representable in markdown (approved decision, see
 * `block-editor/README.md` → "Wrapped Image"). Re-parsing that fragment with
 * the generic markdown parser would therefore produce a plain `image` +
 * `paragraph`, LOSING the block's type and its non-markdown props.
 *
 * So a block-addressed `update` targeting an existing `wrappedImage` block is
 * special-cased here: parse out the leading image line for `url`/`caption`,
 * parse whatever remains as the new inline text, and preserve every other
 * existing prop (`side`, `widthPercent`) verbatim from the block being
 * replaced. Returns `null` when the fragment doesn't start with an image line
 * (caller reports an error rather than silently downgrading the block type).
 */
const WRAPPED_IMAGE_LEAD_IMAGE_RE = /^!\[([^\]]*)\]\(([^)]*)\)[ \t]*\n?([\s\S]*)$/;

function parseWrappedImageUpdateFragment(
  markdown: string,
  parseFragment: ParseFragment,
): { url: string; caption: string; content: any[] } | null {
  const m = markdown.match(WRAPPED_IMAGE_LEAD_IMAGE_RE);
  if (!m) return null;
  const [, caption, url, rest] = m;
  const trimmedRest = rest.trim();
  if (!trimmedRest) return { url, caption, content: [] };
  const parsed = parseFragment(trimmedRest);
  // The remainder is inline text for the SAME block, not a new top-level
  // block — take the first parsed block's inline content, whatever its type
  // (normally `paragraph`).
  return { url, caption, content: parsed[0]?.content ?? [] };
}

/**
 * Hard cap on ops per batch. Each op does an O(n) `indexOfId` scan, so an
 * unbounded batch is O(ops × blocks). The future MCP/REST handler should also
 * `.max()` its input, but bounding here keeps the primitive safe regardless of
 * caller. Generous — real agent edit batches are a handful of ops.
 */
const MAX_OPS = 100;

/**
 * Apply an ordered list of id-addressed ops to a BlockNote document.
 *
 * Id preservation is **by assignment**: `update` stamps the target id back onto
 * the re-parsed block; blocks not named in any op are never serialized and keep
 * their ids by construction. Inserted blocks keep the parser's fresh ids.
 *
 * Ops apply sequentially; a failing op is recorded in `errors` and skipped
 * (the real endpoint may choose to reject the whole batch if `errors` is
 * non-empty — see `dryRun`).
 */
export function applyBlockOps(
  doc: any[],
  ops: BlockOp[],
  parseFragment: ParseFragment,
): ApplyResult {
  let result = [...doc];
  const errors: string[] = [];

  if (ops.length > MAX_OPS) {
    errors.push(`too many ops: ${ops.length} (max ${MAX_OPS}) — batch rejected`);
    return { doc: result, errors };
  }

  for (const op of ops) {
    switch (op.op) {
      case 'update': {
        const i = indexOfId(result, op.id);
        if (i < 0) {
          errors.push(`update: block "${op.id}" not found`);
          break;
        }
        const existing = result[i];
        if (existing?.type === 'wrappedImage') {
          // Preserve `side`/`widthPercent` (and the block's type) — see
          // `parseWrappedImageUpdateFragment` above.
          const wrapped = parseWrappedImageUpdateFragment(op.markdown, parseFragment);
          if (!wrapped) {
            errors.push(`update "${op.id}": wrappedImage fragment must start with an image line (![caption](url))`);
            break;
          }
          result = [
            ...result.slice(0, i),
            {
              ...existing,
              props: { ...existing.props, url: wrapped.url, caption: wrapped.caption },
              content: wrapped.content,
              id: op.id,
            },
            ...result.slice(i + 1),
          ];
          break;
        }
        const parsed = parseFragment(op.markdown);
        if (parsed.length !== 1) {
          errors.push(`update "${op.id}": fragment must be exactly 1 block (got ${parsed.length})`);
          break;
        }
        // PRESERVE the id — the whole point of the op model.
        result = [...result.slice(0, i), { ...parsed[0], id: op.id }, ...result.slice(i + 1)];
        break;
      }
      case 'insertAfter':
      case 'insertBefore': {
        const i = indexOfId(result, op.id);
        if (i < 0) {
          errors.push(`${op.op}: anchor "${op.id}" not found`);
          break;
        }
        const parsed = parseFragment(op.markdown);
        const at = op.op === 'insertAfter' ? i + 1 : i;
        result = [...result.slice(0, at), ...parsed, ...result.slice(at)];
        break;
      }
      case 'appendToEnd': {
        result = [...result, ...parseFragment(op.markdown)];
        break;
      }
      case 'move': {
        const i = indexOfId(result, op.id);
        if (i < 0) {
          errors.push(`move: block "${op.id}" not found`);
          break;
        }
        const anchorId = op.after ?? op.before;
        if (!anchorId) {
          errors.push(`move "${op.id}": requires "after" or "before"`);
          break;
        }
        const moved = result[i];
        const without = result.filter((_, idx) => idx !== i);
        const j = indexOfId(without, anchorId);
        if (j < 0) {
          errors.push(`move "${op.id}": anchor "${anchorId}" not found`);
          break;
        }
        const at = op.after ? j + 1 : j;
        without.splice(at, 0, moved);
        result = without;
        break;
      }
      case 'delete': {
        const i = indexOfId(result, op.id);
        if (i < 0) {
          errors.push(`delete: block "${op.id}" not found`);
          break;
        }
        result = result.filter((b) => b.id !== op.id);
        break;
      }
      default: {
        errors.push(`unknown op: ${JSON.stringify(op)}`);
      }
    }
  }

  return { doc: result, errors };
}
