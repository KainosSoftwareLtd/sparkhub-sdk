import { z } from 'zod';
import { sanitizeBlockDocumentUrls } from './sparkmd';

/**
 * Zod for a stored BlockNote document. Pure (only `zod` + the pure `sparkmd`
 * projection) so it is safe to import in server route handlers — do NOT import
 * the block-editor barrel there (it pulls `@blocknote/react`).
 *
 * Bundles the three storage guards every write path needs:
 *  - `.max(maxBlocks)` — top-level block-count ceiling.
 *  - byte-size `.refine` — stops a crafted payload bloating a single block past
 *    the count cap toward the 16 MB BSON limit / CPU-heavy tree walks.
 *  - `.transform(sanitizeBlockDocumentUrls)` — neutralizes `javascript:`/`data:`
 *    anchor & link URLs at the boundary, so a hand-crafted `content` POST can
 *    never persist a script URL (defence the read-time projection guard can't
 *    give a future raw-JSON consumer).
 *
 * Surfaces compose their own `.min(1)` (via `min`), `.nullable()`, `.optional()`,
 * and may tighten the byte cap / message via `maxBytes` / `sizeMessage` —
 * `MAX_CONTENT_BYTES` stays the hard platform ceiling (callers can only lower it).
 */
const MAX_CONTENT_BYTES = 512_000;

export function blockDocumentArray(opts: {
  maxBlocks: number;
  min?: number;
  /** Per-surface serialized-size cap; clamped to the platform ceiling. */
  maxBytes?: number;
  /** Human-readable 400 message when the size cap is exceeded. */
  sizeMessage?: string;
}) {
  const maxBytes = Math.min(opts.maxBytes ?? MAX_CONTENT_BYTES, MAX_CONTENT_BYTES);
  let base = z.array(z.record(z.string(), z.unknown())).max(opts.maxBlocks);
  if (opts.min !== undefined) base = base.min(opts.min);
  return base
    .refine((c) => JSON.stringify(c).length <= maxBytes, opts.sizeMessage ?? 'content too large')
    .transform((c) => sanitizeBlockDocumentUrls(c));
}
