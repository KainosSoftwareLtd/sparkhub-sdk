/**
 * Per-surface editor profiles. One schema, but each surface offers a different
 * subset of blocks/commands and a different density — mirroring the
 * `full | minimal | none` toolbar variants of the existing `SparkhubEditor`.
 */
export type BlockEditorProfile = 'full' | 'compact' | 'inline';

export interface ProfileConfig {
  placeholder: string;
  minHeight: number;
  /** Offer the Mermaid diagram command in the slash menu. */
  allowMermaid: boolean;
  /** Offer the Table command in the slash menu. */
  allowTables: boolean;
  /** Offer the Image command in the slash menu (paste/drop still works if uploadFile is set). */
  allowImages: boolean;
  /**
   * Offer the "Image with text wrap" (`wrappedImage`) command in the slash
   * menu. KB-only in v1 (approved decision) — the block is still in the
   * shared schema on every surface (so stored KB documents copied/quoted
   * elsewhere still render correctly), just not insertable from other
   * surfaces' slash menus.
   */
  allowWrappedImage: boolean;
  /** Show the floating formatting toolbar on selection. */
  showFormattingToolbar: boolean;
  /**
   * Compact side menu: hide the ＋ add-block button and place the drag handle in
   * the RIGHT gutter (default BlockNote is ＋ and drag on the left). Used on the
   * dense chat/ticket surfaces.
   */
  compactSideMenu: boolean;
}

export const PROFILES: Record<BlockEditorProfile, ProfileConfig> = {
  // KB pages, long-form docs.
  full: {
    placeholder: "Write, or press '/' for commands…",
    minHeight: 320,
    allowMermaid: true,
    allowTables: true,
    allowImages: true,
    allowWrappedImage: true,
    showFormattingToolbar: true,
    compactSideMenu: false,
  },
  // Ticket descriptions, conversation messages.
  compact: {
    placeholder: "Write… ('/' for commands, '@' to mention)",
    minHeight: 140,
    allowMermaid: true,
    allowTables: true,
    allowImages: true,
    allowWrappedImage: false,
    showFormattingToolbar: true,
    compactSideMenu: true,
  },
  // Workbook descriptions and other near-single-line fields.
  inline: {
    placeholder: 'Add a description…',
    minHeight: 48,
    allowMermaid: false,
    allowTables: false,
    allowImages: false,
    allowWrappedImage: false,
    showFormattingToolbar: false,
    compactSideMenu: true,
  },
};
