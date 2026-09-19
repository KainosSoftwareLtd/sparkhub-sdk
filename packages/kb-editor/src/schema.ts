import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  createCodeBlockSpec,
  createHeadingBlockSpec,
  createTableBlockSpec,
  propsToAttributes,
  type Block,
} from '@blocknote/core';
import { codeBlockOptions } from '@blocknote/code-block';
import { tableBorderPropSchema } from './table-borders';
import { MermaidBlock } from './blocks/MermaidBlock';
import { CalloutBlock } from './blocks/CalloutBlock';
import { FileAssetBlock } from './blocks/FileBlock';
import { DrawioBlock } from './blocks/DrawioBlock';
import { WrappedImageBlock } from './blocks/WrappedImageBlock';
import { Mention } from './inline/Mention';
import { AnchorLink } from './inline/AnchorLink';

/**
 * The single BlockNote schema shared by every surface. Default blocks/inline
 * content plus SparkHub additions:
 *   - `mermaid` block (diagram-as-block, carries source + stable id)
 *   - `mention` inline content (`@user`, and the seam for object-links)
 *
 * One schema, many surfaces — surface differences are expressed through
 * `profiles.ts` (which slash items / toolbar are offered), not through
 * divergent schemas, so the stored JSON is interchangeable across KB pages,
 * tickets, conversations, and workbook descriptions.
 *
 * `fileAsset` (#1128 Phase 1a) is registered globally like every other block,
 * but its authoring affordances (choose/create) only activate when the host
 * surface supplies a `FileAssetContext` provider — today only KB pages do
 * (`PageEditor.tsx`). Elsewhere it still renders (read-only preview always
 * works), just without the "choose/create" UI. NOT the same as BlockNote's
 * own default `file` block (generic upload/attachment) already in
 * `defaultBlockSpecs` below.
 */
/**
 * The built-in table spec with the per-table decoration props (CR #1147:
 * border style/width/color + alignment) added to its propSchema.
 * `createTableBlockSpec()` takes no options in
 * BlockNote 0.51, so we respec it: extend `config.propSchema` AND `.extend()`
 * the spec's TipTap node with matching attributes (via `propsToAttributes`,
 * the same helper BlockNote uses) so the new props are real node attributes —
 * that is what makes them persist in the stored BlockNote JSON and round-trip
 * through `blockToNode`/`nodeToBlock` on every surface. Rendering is handled
 * by `syncTableBorderDecorations` (see `table-borders.ts`) + `block-editor.css`.
 */
function createTableBlockSpecWithBorders() {
  const base = createTableBlockSpec();
  return {
    ...base,
    config: {
      ...base.config,
      propSchema: { ...base.config.propSchema, ...tableBorderPropSchema },
    },
    implementation: {
      ...base.implementation,
      node: base.implementation.node.extend({
        addAttributes() {
          return { ...this.parent?.(), ...propsToAttributes(tableBorderPropSchema) };
        },
      }),
    },
  };
}

export const blockEditorSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    // CONFIGURED specs (the editor `codeBlock`/`heading` options DON'T apply to a
    // custom schema's pre-built default specs — they must be configured here):
    //  - code block: shiki highlighting + language selector
    //  - heading: toggle/collapsible headings disabled (no ▸ arrow / slash cmds)
    //  - table: built-in spec respecced with per-table border + alignment props (#1147)
    codeBlock: createCodeBlockSpec(codeBlockOptions),
    heading: createHeadingBlockSpec({ allowToggleHeadings: false }),
    table: createTableBlockSpecWithBorders(),
    // `createReactBlockSpec` returns a spec *creator* — call it to get the spec.
    mermaid: MermaidBlock(),
    callout: CalloutBlock(),
    fileAsset: FileAssetBlock(),
    // Diagram (draw.io) — two-asset model, renders the PNG render read-only
    // (#1128 Phase 1b). Only offered in the slash menu when a FileAssetContext
    // provider is present (KB pages), like `fileAsset`.
    drawio: DrawioBlock(),
    wrappedImage: WrappedImageBlock(),
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    mention: Mention,
    // Typed link to a SparkHub object or external URL (created by pasting a URL).
    anchor: AnchorLink,
  },
});

type SchemaParts<T> =
  T extends BlockNoteSchema<infer B, infer I, infer S> ? { b: B; i: I; s: S } : never;
type Parts = SchemaParts<typeof blockEditorSchema>;

/** The lossless BlockNote JSON document — the stored source of truth. */
export type BlockEditorDocument = Block<Parts['b'], Parts['i'], Parts['s']>[];
