/**
 * `@sparkhub/kb-editor` — the BlockNote editor SparkHub's Knowledge Base uses,
 * lifted for partner apps (BlockNote is first-class: a partner app authors and
 * reads KB pages as `content` block arrays, exactly as SparkHub's own editor
 * does). Browser entry — pulls @blocknote/react + CSS. Server code imports
 * `@sparkhub/kb-editor/pure` instead.
 */
export { BlockEditor } from './BlockEditor';
export type { BlockEditorProps } from './BlockEditor';
export { blockEditorSchema } from './schema';
export type { BlockEditorDocument } from './schema';
export { PROFILES } from './profiles';
export type { BlockEditorProfile, ProfileConfig } from './profiles';
export type { MentionUser } from './inline/Mention';
export type { AnchorProps } from './inline/AnchorLink';
export { ANCHOR_KIND_LABELS } from './inline/AnchorLink';
export { FileAssetContext } from './blocks/FileBlock';
export type { FileAssetProvider, FileAssetInfo } from './blocks/FileBlock';
export { DiagramAssetContext } from './blocks/DrawioBlock';
export type { DiagramAssetProvider, DiagramAssetInfo } from './blocks/DrawioBlock';
export * from './pure';
