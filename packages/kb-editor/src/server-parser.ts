/* eslint-disable @typescript-eslint/no-explicit-any -- thin bridge over the pure
   markdown→blocks parser; blocks are structurally typed BlockNote JSON. */

/**
 * Server-side SparkMD parse bridge — now PURE (remark-based).
 *
 * Previously this wrapped `@blocknote/server-util`'s headless editor, which
 * dragged `@blocknote/react` (React.createContext — fatal under the app-route
 * RSC react), `jsdom`, and `yjs`→`lib0` (unresolvable in the Vercel lambda) into
 * every consumer, and forced `@blocknote/*` to be externalized (which then broke
 * the client editor's CSS import). It is replaced by the dependency-free
 * `./markdown-to-blocks` converter (plain `unified`/`remark`), whose output is
 * matched 1:1 against the old server-util parser (see `markdown-to-blocks.smoke.ts`).
 *
 * Safe to import from a server route. The reverse direction (blocks→markdown)
 * lives in `./sparkmd` (`blocksToMarkdown` / `blocksToPlainText`) — also pure —
 * so there is no longer any server-util `blocksToMarkdownLossy` here.
 */
import { sparkMDToBlocks } from './sparkmd';
import { parseMarkdownToBlocks as parsePureMarkdown } from './markdown-to-blocks';

/** Raw markdown → BlockNote blocks (no SparkMD transforms) — the injected parser. */
export function parseMarkdownToBlocks(markdown: string): any[] {
  return parsePureMarkdown(markdown);
}

/** Full SparkMD → blocks (anchors stripped, mermaid + mentions handled). */
export function parseSparkMD(markdown: string): Promise<any[]> {
  return sparkMDToBlocks(markdown, parseMarkdownToBlocks);
}
