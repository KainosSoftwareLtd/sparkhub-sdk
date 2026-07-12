/**
 * The viewer-side BlockNote schema — BlockNote's default block set plus
 * read-only parity renderers for SparkHub's custom blocks and inline content.
 *
 * Wire-compatibility contract: block type names + propSchema keys/defaults
 * MUST match SparkHub's editor schema (`src/features/shared/block-editor/
 * schema.ts` in the SparkHub app). The implementations are independent
 * (read-only, no app coupling); only the stored-JSON shape is shared.
 *
 * codeBlock / heading note: SparkHub configures its codeBlock with shiki
 * syntax highlighting and disables toggleable headings. This viewer keeps
 * BlockNote's DEFAULT specs for both — code renders as a plain code block
 * (correct content, `language` prop preserved, no highlighting; a tolerable
 * v1 tradeoff that avoids shipping shiki), and headings render identically
 * since toggling is an authoring affordance.
 */
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from "@blocknote/core";
import {
  CalloutBlock,
  DrawioBlock,
  FileAssetBlock,
  MermaidBlock,
  WrappedImageBlock,
} from "./blocks";
import { Anchor, Mention } from "./inline";
import type { PropSchemaLike, ViewerSchemaInfo } from "./normalize";

export const viewerSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    mermaid: MermaidBlock,
    callout: CalloutBlock,
    fileAsset: FileAssetBlock,
    drawio: DrawioBlock,
    wrappedImage: WrappedImageBlock,
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    mention: Mention,
    anchor: Anchor,
  },
});

/**
 * Schema description consumed by the normalizer (`normalizeDocument`) —
 * derived from the live schema so the crash guard can never drift from what
 * the viewer actually registers.
 */
export const viewerSchemaInfo: ViewerSchemaInfo = {
  blocks: Object.fromEntries(
    Object.entries(viewerSchema.blockSchema).map(([type, config]) => [
      type,
      (config.propSchema ?? {}) as PropSchemaLike,
    ]),
  ),
  inlines: Object.fromEntries(
    Object.entries(viewerSchema.inlineContentSchema).map(([type, config]) => [
      type,
      config === "text" || config === "link"
        ? config
        : ((config.propSchema ?? {}) as PropSchemaLike),
    ]),
  ),
};
