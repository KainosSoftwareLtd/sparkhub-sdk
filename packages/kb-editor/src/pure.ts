/**
 * `@sparkhub/kb-editor/pure` — the server-safe half of the package: no React,
 * no DOM, no @blocknote/react. Import THIS in server routes / Node scripts
 * (a SparkHub satellite, a partner app's backend); import the root entry only
 * from the browser.
 */
export {
  blocksToSparkMD,
  blocksToMarkdown,
  blocksToPlainText,
  extractMentionUserIds,
  extractAnchors,
  isBlockDocumentEmpty,
  sparkMDToBlocks,
  sanitizeBlockDocumentUrls,
} from './sparkmd';
export type { MarkdownProjectionOptions, ExtractedAnchor } from './sparkmd';
export { applyBlockOps } from './block-ops';
export type { BlockOp, ParseFragment, ApplyResult } from './block-ops';
export { parseMarkdownToBlocks } from './markdown-to-blocks';
export { parseSparkMD } from './server-parser';
export { blockDocumentArray } from './content-schema';
export {
  collectTableBorderProps,
  resolveTableBorderProps,
  TABLE_BORDER_DEFAULTS,
} from './table-borders';
export type { TableBorderProps } from './table-borders';
