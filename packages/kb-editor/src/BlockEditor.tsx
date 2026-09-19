'use client';

import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import './block-editor.css';

import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { filterSuggestionItems } from '@blocknote/core';
import {
  getDefaultReactSlashMenuItems,
  getDefaultReactEmojiPickerItems,
  SuggestionMenuController,
  GridSuggestionMenuController,
  SideMenu,
  SideMenuController,
  DragHandleButton,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { Workflow, MessageSquareQuote, FileText, ImagePlus } from 'lucide-react';
import { blockEditorSchema, type BlockEditorDocument } from './schema';
import { PROFILES, type BlockEditorProfile } from './profiles';
import { getMentionMenuItems, type MentionUser } from './inline/Mention';
import type { AnchorProps } from './inline/AnchorLink';
import { pendingCalloutOpen } from './blocks/CalloutBlock';
import { FileAssetContext } from './blocks/FileBlock';
import { DiagramAssetContext } from './blocks/DrawioBlock';
import { TableMenu } from './TableMenu';
import {
  collectTableBorderProps,
  syncTableBorderDecorations,
  type TableBorderBlockLike,
  type TableBorderProps,
} from './table-borders';
import { ensureDualThemeShikiParser } from './shiki-dual-theme';

// Must run before the first editor instantiates its shiki plugin — seeds the
// dual-theme token parser so the `--shiki-light`/`--shiki-dark` variables the
// token-color CSS relies on actually exist (see shiki-dual-theme.ts).
// No-op on the server.
ensureDualThemeShikiParser();

/** A single http(s) URL with nothing else around it. */
const SINGLE_URL_RE = /^https?:\/\/\S+$/i;

/** BlockNote block ids are UUIDs; only ids matching this ever reach CSS text. */
const SAFE_BLOCK_ID_RE = /^[A-Za-z0-9_-]+$/;

/**
 * One expand/collapse affordance for an over-tall code block (CR #1146
 * Phase 2). The button is rendered in a React overlay OUTSIDE the
 * ProseMirror DOM and positioned over the block's top-right corner —
 * injecting it (or a class) into the code block's node view is NOT safe:
 * unlike the table node view, the code block's has no `ignoreMutation`, so
 * ProseMirror would try to re-read the mutated DOM (risking content
 * corruption / re-render loops). That same constraint rules out an inline
 * `style` write on the `pre` (ProseMirror only ignores spurious EMPTY style
 * mutations), so expansion is applied via a `<style>` override whose
 * selectors are anchored to this instance's `data-editor-instance` attribute
 * — stamped on OUR wrapper, outside the PM DOM, hence mutation-safe. The
 * instance anchor matters: block ids are deliberately stable across versions
 * of the same document, so an UNSCOPED per-id rule leaks into sibling
 * editors showing the same blocks (e.g. KB PageEditor's live draft next to
 * VersionHistoryPanel's read-only render of an older version).
 */
interface CodeToggle {
  blockId: string;
  top: number;
  right: number;
  expanded: boolean;
}

function sameCodeToggles(a: CodeToggle[], b: CodeToggle[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (t, i) =>
      t.blockId === b[i].blockId &&
      t.top === b[i].top &&
      t.right === b[i].right &&
      t.expanded === b[i].expanded,
  );
}

/**
 * One table-settings menu anchor per rendered table (CR #1147 rework). Same
 * overlay pattern as CodeToggle — the button lives OUTSIDE the ProseMirror
 * DOM. The previous formatting-toolbar placement failed in prod for two
 * reasons: the toolbar only shows on a NON-EMPTY selection (a caret inside a
 * cell never surfaces it), and nested Radix Selects inside the toolbar
 * popover were dismissed before their onValueChange fired (only the plain
 * swatch buttons persisted — the "only color changes" symptom).
 */
interface TableMenuAnchor {
  blockId: string;
  top: number;
  right: number;
  config: TableBorderProps;
}

function sameTableMenus(a: TableMenuAnchor[], b: TableMenuAnchor[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((m, i) => {
    const o = b[i];
    return (
      m.blockId === o.blockId &&
      m.top === o.top &&
      m.right === o.right &&
      m.config.borderStyle === o.config.borderStyle &&
      m.config.borderWidth === o.config.borderWidth &&
      m.config.borderColor === o.config.borderColor &&
      m.config.tableAlignment === o.config.tableAlignment
    );
  });
}

/**
 * One line-number gutter per code block (#1146 follow-up). Same PM-DOM
 * constraint as CodeToggle: the code block's node view has no
 * `ignoreMutation`, so the gutter CANNOT be injected into it — it is a React
 * overlay positioned over the pre's left edge. Numbers are derived from
 * GEOMETRY (content height / line-height), not from splitting the text: the
 * pre is `white-space: pre` + `overflow-x: auto` (code never soft-wraps), so
 * visual rows === geometric rows, including ProseMirror's trailing-break
 * quirks. Vertical scroll (the #1146 20-line cap) is tracked by listening to
 * the pre's `scroll` event — listening/reading never mutates the PM DOM —
 * and translating the number column imperatively (no re-render per frame).
 * The pre's extra left padding + the language selector's offset come from
 * static stylesheet rules in `block-editor.css` (stylesheets aren't DOM
 * mutations). The gutter is `pointer-events: none` (clicks fall through to
 * the editor) and `user-select: none`, and lives outside the contenteditable
 * — copying code can never grab the numbers.
 */
interface CodeGutter {
  blockId: string;
  top: number;
  left: number;
  height: number;
  padTop: number;
  lineHeight: number;
  rows: number;
}

function sameCodeGutters(a: CodeGutter[], b: CodeGutter[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (g, i) =>
      g.blockId === b[i].blockId &&
      g.top === b[i].top &&
      g.left === b[i].left &&
      g.height === b[i].height &&
      g.padTop === b[i].padTop &&
      g.lineHeight === b[i].lineHeight &&
      g.rows === b[i].rows,
  );
}

/** "1\n2\n…\nN" — a single text node keeps the gutter cheap even for huge blocks. */
function lineNumbersText(rows: number): string {
  let out = '';
  for (let i = 1; i <= rows; i++) out += i === 1 ? '1' : `\n${i}`;
  return out;
}

/** The block types the decoration pass cares about (code caps + table borders). */
const DECORATED_BLOCK_SELECTOR =
  "[data-content-type='codeBlock'], [data-content-type='table']";

/**
 * True when a mutation batch touches a code-block/table subtree (or adds /
 * removes nodes containing one) — lets the MutationObserver skip scheduling
 * a decoration pass for unrelated keystrokes. Layout shifts caused by edits
 * elsewhere are still handled: editor transactions go through `onChange`
 * (unconditional schedule) and height changes hit the ResizeObserver.
 */
function mutationsTouchDecoratedBlocks(mutations: MutationRecord[]): boolean {
  const isOrContains = (node: Node): boolean =>
    node instanceof Element &&
    (node.matches(DECORATED_BLOCK_SELECTOR) ||
      node.querySelector(DECORATED_BLOCK_SELECTOR) !== null);
  return mutations.some((mutation) => {
    const el =
      mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
    if (el?.closest(DECORATED_BLOCK_SELECTOR)) return true;
    for (const list of [mutation.addedNodes, mutation.removedNodes]) {
      for (const node of list) {
        if (isOrContains(node)) return true;
      }
    }
    return false;
  });
}

export interface BlockEditorProps {
  /** Stored BlockNote JSON document (the source of truth). Omit for an empty editor. */
  value?: BlockEditorDocument;
  /** Called on every edit with the full updated document (the stored source of truth). */
  onChange?: (doc: BlockEditorDocument) => void;
  /**
   * Called on every edit with the derived markdown projection (lossy) — what
   * we'd index for search / hand to the agent. Optional; computed async.
   */
  onMarkdownChange?: (markdown: string) => void;
  /** Surface profile — drives which commands/toolbar are offered. Default `'full'`. */
  profile?: BlockEditorProfile;
  /** Render read-only (no editing affordances). */
  readOnly?: boolean;
  /** Org members for the `@`-mention picker. */
  mentionUsers?: MentionUser[];
  /**
   * Resolves a pasted URL into a typed anchor ({ url, kind, title }). When
   * provided, pasting a bare URL inserts an anchor pill instead of plain text.
   * Surfaces inject this (it hits `/threads/api/anchors/resolve`); omit to disable
   * anchor-on-paste. Returns null to fall back to the default paste.
   */
  resolveAnchor?: (url: string) => Promise<AnchorProps | null>;
  /**
   * Uploads a pasted/dropped/inserted image and returns its URL. When provided,
   * BlockNote handles image **paste and drag-drop automatically** — no extra
   * wiring. In production, bind to `useAssetUpload()` from the asset library.
   */
  uploadFile?: (file: File) => Promise<string>;
  /**
   * Turns a `video` / `audio` block's STORED url (the stable KB asset serve
   * URL) into a PLAYABLE one at render time — a short-lived signed URL the
   * `<video>` element can stream from. Called ONLY for video/audio blocks
   * (the block type is looked up in the document), never for images, so
   * image blocks keep their stored url with no extra request. Absent →
   * every block renders its stored url as-is. The KB host binds this to
   * `useMediaUrlResolver()` (`knowledge-base/hooks`), which also renews the
   * url before it expires.
   */
  resolveMediaUrl?: (url: string) => Promise<string>;
  /**
   * Explicit theme; omit to follow the host page's `data-theme` attribute on
   * `<html>` (observed live), the same convention as `@sparkhub/kb-viewer`.
   */
  theme?: 'light' | 'dark';
  className?: string;
}

/** Block types whose `props.url` goes through `resolveMediaUrl`. */
const MEDIA_BLOCK_TYPES: ReadonlySet<string> = new Set(['video', 'audio']);

interface UrlBlockLike {
  type?: string;
  props?: { url?: unknown };
  children?: UrlBlockLike[];
}

/** True when SOME video/audio block in `blocks` stores exactly `url`. */
function isMediaBlockUrl(blocks: UrlBlockLike[], url: string): boolean {
  for (const b of blocks) {
    if (b.type && MEDIA_BLOCK_TYPES.has(b.type) && b.props?.url === url) return true;
    if (b.children && b.children.length > 0 && isMediaBlockUrl(b.children, url)) return true;
  }
  return false;
}

/**
 * BlockEditor — a surface-agnostic, block-based rich editor (BlockNote on
 * Tiptap/ProseMirror). Stores lossless BlockNote JSON with stable per-block
 * ids (the foundation for comment/presence anchoring, drag-reorder, and a
 * future collaboration layer). Intended as the next-gen engine behind the same
 * surfaces the Lexical-based `SparkhubEditor` serves today.
 */
export function BlockEditor({
  value,
  onChange,
  onMarkdownChange,
  profile = 'full',
  readOnly = false,
  mentionUsers = [],
  uploadFile,
  resolveAnchor,
  resolveMediaUrl,
  theme: themeProp,
  className,
}: BlockEditorProps) {
  // Theme: an explicit prop wins; otherwise follow the host page's
  // `data-theme` attribute (kb-viewer pattern — no next-themes dependency).
  const [observedTheme, setObservedTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    if (themeProp) return;
    const read = () =>
      setObservedTheme(
        document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
      );
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [themeProp]);
  const resolvedTheme = themeProp ?? observedTheme;
  const cfg = PROFILES[profile];
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Per-instance anchor for the expand-override CSS (hydration-stable via
  // useId). Block ids are stable across versions/copies of a document, so the
  // override MUST be scoped to this editor instance — several BlockEditors can
  // show the same block ids side by side (live draft + version history).
  const instanceId = useId();
  // Ephemeral (deliberately NOT persisted) expand state for over-tall code
  // blocks — a Set of block ids. Every render starts collapsed, including
  // read-only surfaces; see README ("Code block cap + expand toggle").
  const [expandedCodeIds, setExpandedCodeIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const expandedCodeIdsRef = useRef(expandedCodeIds);
  expandedCodeIdsRef.current = expandedCodeIds;
  const [codeToggles, setCodeToggles] = useState<CodeToggle[]>([]);
  // Table settings menus (CR #1147 rework): one anchored button per table,
  // revealed while the table is hovered OR the caret sits inside it (both
  // reach the config in ≤2 clicks without selecting the whole grid). Hover
  // tracking listens on the table's blockContent (listening never mutates the
  // PM DOM); the short clear-delay lets the pointer travel from the table
  // onto the overlay button (which is NOT a DOM descendant of the table).
  const [tableMenus, setTableMenus] = useState<TableMenuAnchor[]>([]);
  const [hoveredTableId, setHoveredTableId] = useState<string | null>(null);
  const [caretTableId, setCaretTableId] = useState<string | null>(null);
  const [openTableMenuId, setOpenTableMenuId] = useState<string | null>(null);
  const hoverClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverBoundTablesRef = useRef(new WeakSet<HTMLElement>());
  // Line-number gutters (one per rendered code block) + their scroll sync
  // plumbing: current scrollTop per block (source of truth for the render),
  // the mounted number-column elements (for imperative transform updates on
  // scroll, no re-render per frame), and the pres we already bound a scroll
  // listener to (WeakSet — recreated node views get a fresh pre, old ones GC).
  const [codeGutters, setCodeGutters] = useState<CodeGutter[]>([]);
  const gutterScrollTopsRef = useRef(new Map<string, number>());
  const gutterInnerRefs = useRef(new Map<string, HTMLDivElement>());
  const scrollBoundPresRef = useRef(new WeakSet<HTMLElement>());
  const decorateFrameRef = useRef<number | null>(null);
  // KB-only File-asset commands (#1128 Phase 1a) — present only when the host
  // surface wraps this editor in a `FileAssetContext.Provider` (today only
  // `knowledge-base/components/PageEditor.tsx`). See `blocks/FileBlock.tsx`.
  const fileAssetProvider = useContext(FileAssetContext);
  // KB-only Diagram (draw.io) command (#1128 Phase 1b) — same gating as the
  // File one, via `DiagramAssetContext`. See `blocks/DrawioBlock.tsx`.
  const diagramAssetProvider = useContext(DiagramAssetContext);

  // `resolveFileUrl` is captured ONCE at editor creation, so both the editor
  // (for the block-type lookup) and the latest `resolveMediaUrl` prop are read
  // through refs at call time. BlockNote calls it from the image, video AND
  // audio node views; only video/audio blocks are resolved here.
  const resolveMediaUrlRef = useRef(resolveMediaUrl);
  resolveMediaUrlRef.current = resolveMediaUrl;
  const editorDocRef = useRef<() => UrlBlockLike[]>(() => []);

  const editor = useCreateBlockNote({
    schema: blockEditorSchema,
    initialContent: value && value.length > 0 ? value : undefined,
    uploadFile,
    resolveFileUrl: async (url: string) => {
      const fn = resolveMediaUrlRef.current;
      if (!fn || !isMediaBlockUrl(editorDocRef.current(), url)) return url;
      return fn(url);
    },
    // Paste a bare URL → resolve it to a typed anchor pill. Resolution is async
    // and the paste handler is sync, so we claim the paste (return true) and
    // insert the resolved anchor when it lands; on failure we insert a generic
    // `link` anchor so the URL is never lost.
    pasteHandler: ({ event, editor: ed, defaultPasteHandler }) => {
      if (!resolveAnchor) return defaultPasteHandler();
      const text = event.clipboardData?.getData('text/plain')?.trim();
      if (!text || !SINGLE_URL_RE.test(text)) return defaultPasteHandler();
      void resolveAnchor(text)
        .then((resolved) => {
          const props = resolved ?? { url: text, kind: 'link', title: text };
          ed.insertInlineContent([{ type: 'anchor', props }, ' ']);
        })
        .catch(() => {
          ed.insertInlineContent([
            { type: 'anchor', props: { url: text, kind: 'link', title: text } },
            ' ',
          ]);
        });
      return true;
    },
    // NOTE: code-block highlighting + heading-toggle-disable are configured on
    // the SCHEMA specs (see schema.ts), not here — the editor options don't
    // apply to a custom schema's pre-built default specs.
    // Advanced table features (all free): header rows/cols, per-cell colors,
    // and cell split/merge.
    tables: {
      headers: true,
      splitCells: true,
      cellBackgroundColor: true,
      cellTextColor: true,
    },
  });

  // Hover tracking for the table menus. Clearing is delayed so the pointer
  // can travel from the table onto the overlay button without a flicker gap
  // (the button's own mouseenter cancels the pending clear).
  const markTableHovered = useCallback((blockId: string | null) => {
    if (hoverClearTimerRef.current !== null) {
      clearTimeout(hoverClearTimerRef.current);
      hoverClearTimerRef.current = null;
    }
    if (blockId !== null) {
      setHoveredTableId(blockId);
    } else {
      hoverClearTimerRef.current = setTimeout(() => {
        hoverClearTimerRef.current = null;
        setHoveredTableId(null);
      }, 180);
    }
  }, []);
  useEffect(
    () => () => {
      if (hoverClearTimerRef.current !== null) clearTimeout(hoverClearTimerRef.current);
    },
    [],
  );

  // Caret tracking: a plain text cursor inside a table cell resolves to the
  // table block — this is what makes the menu reachable WITHOUT selecting
  // the whole grid (the old formatting-toolbar path required a non-empty
  // selection and so never appeared for a caret in a cell).
  useEffect(() => {
    if (readOnly) return;
    return editor.onSelectionChange(() => {
      try {
        const block = editor.getTextCursorPosition().block;
        setCaretTableId(block?.type === 'table' ? block.id : null);
      } catch {
        setCaretTableId(null);
      }
    });
  }, [editor, readOnly]);

  /**
   * Post-render decoration pass (rAF-debounced):
   *  1. Stamps per-table decoration config (borders + alignment, CR #1147)
   *     onto rendered tables — safe direct DOM writes, see
   *     `syncTableBorderDecorations`.
   *  2. Measures code blocks and computes overlay positions for the
   *     expand/collapse buttons (CR #1146 Phase 2) — the button only appears
   *     when the content actually overflows the 20-line CSS cap (or the
   *     block is currently expanded, so it can be collapsed again).
   *  3. Computes the line-number gutter for EVERY code block (#1146
   *     follow-up) — rows from geometry, scroll listener bound once per pre.
   *  4. Computes anchors for the per-table settings menus (edit mode only)
   *     and binds hover listeners on each table's blockContent.
   */
  const runDecorationPass = useCallback(() => {
    const root = wrapperRef.current;
    if (!root) return;

    // Cheap short-circuit: nothing to decorate (also clears any stale
    // toggles/gutters/menus left behind when the last code/table block was
    // deleted).
    if (!root.querySelector(DECORATED_BLOCK_SELECTOR)) {
      setCodeToggles((prev) => (prev.length === 0 ? prev : []));
      setCodeGutters((prev) => (prev.length === 0 ? prev : []));
      setTableMenus((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const doc = editor.document as unknown as TableBorderBlockLike[];
    syncTableBorderDecorations(root, doc);

    const rootRect = root.getBoundingClientRect();
    const nextToggles: CodeToggle[] = [];
    const nextGutters: CodeGutter[] = [];
    root
      .querySelectorAll<HTMLElement>(".bn-block-content[data-content-type='codeBlock']")
      .forEach((el) => {
        const pre = el.querySelector<HTMLElement>(':scope > pre');
        const blockId = el.closest('[data-id]')?.getAttribute('data-id');
        if (!pre || !blockId || !SAFE_BLOCK_ID_RE.test(blockId)) return;

        const rect = el.getBoundingClientRect();
        const preRect = pre.getBoundingClientRect();
        const computed = window.getComputedStyle(pre);
        const padTop = parseFloat(computed.paddingTop) || 0;
        const padBottom = parseFloat(computed.paddingBottom) || 0;
        const lineHeight =
          parseFloat(computed.lineHeight) || (parseFloat(computed.fontSize) || 14) * 1.5;
        const rows = Math.max(
          1,
          Math.round((pre.scrollHeight - padTop - padBottom) / lineHeight),
        );

        // Line-number gutter — every code block, both edit and read-only.
        nextGutters.push({
          blockId,
          top: Math.round(preRect.top - rootRect.top),
          left: Math.round(preRect.left - rootRect.left),
          height: pre.clientHeight,
          padTop,
          lineHeight,
          rows,
        });
        // Keep the render-time transform truthful (a remounted pre resets to
        // scrollTop 0 without firing a scroll event).
        gutterScrollTopsRef.current.set(blockId, pre.scrollTop);
        // Bind the scroll sync once per pre element (reading + listening —
        // never mutating the PM DOM). Recreated node views re-bind here.
        if (!scrollBoundPresRef.current.has(pre)) {
          scrollBoundPresRef.current.add(pre);
          pre.addEventListener(
            'scroll',
            () => {
              gutterScrollTopsRef.current.set(blockId, pre.scrollTop);
              const inner = gutterInnerRefs.current.get(blockId);
              if (inner) inner.style.transform = `translateY(${-pre.scrollTop}px)`;
            },
            { passive: true },
          );
        }

        // Expand/collapse toggle — only when the cap actually bites.
        const expanded = expandedCodeIdsRef.current.has(blockId);
        const overflowing = pre.scrollHeight > pre.clientHeight + 1;
        if (!expanded && !overflowing) return;
        nextToggles.push({
          blockId,
          top: Math.round(rect.top - rootRect.top) + 6,
          right: Math.round(rootRect.right - rect.right) + 8,
          expanded,
        });
      });
    setCodeToggles((prev) => (sameCodeToggles(prev, nextToggles) ? prev : nextToggles));
    setCodeGutters((prev) => (sameCodeGutters(prev, nextGutters) ? prev : nextGutters));

    // Table settings menus — edit mode only (config is an editing feature).
    const nextMenus: TableMenuAnchor[] = [];
    if (!readOnly) {
      const configById = new Map<string, TableBorderProps>();
      collectTableBorderProps(doc, configById);
      root
        .querySelectorAll<HTMLElement>(".bn-block-content[data-content-type='table']")
        .forEach((el) => {
          const blockId = el.closest('[data-id]')?.getAttribute('data-id');
          const config = blockId ? configById.get(blockId) : undefined;
          if (!blockId || !config || !SAFE_BLOCK_ID_RE.test(blockId)) return;
          const rect = el.getBoundingClientRect();
          nextMenus.push({
            blockId,
            top: Math.round(rect.top - rootRect.top) + 4,
            // 28px keeps the button left of BlockNote's add-column widget strip.
            right: Math.round(rootRect.right - rect.right) + 28,
            config,
          });
          // Bind hover listeners once per element (recreated node views get
          // fresh elements and re-bind here; old ones are GC'd via WeakSet).
          if (!hoverBoundTablesRef.current.has(el)) {
            hoverBoundTablesRef.current.add(el);
            el.addEventListener('mouseenter', () => markTableHovered(blockId));
            el.addEventListener('mouseleave', () => markTableHovered(null));
          }
        });
    }
    setTableMenus((prev) => (sameTableMenus(prev, nextMenus) ? prev : nextMenus));
  }, [editor, readOnly, markTableHovered]);

  const scheduleDecorationPass = useCallback(() => {
    if (decorateFrameRef.current !== null) return;
    decorateFrameRef.current = requestAnimationFrame(() => {
      decorateFrameRef.current = null;
      runDecorationPass();
    });
  }, [runDecorationPass]);

  useEffect(() => {
    const root = wrapperRef.current;
    if (!root) return;
    scheduleDecorationPass();
    // Catches node-view (re)mounts and content changes; attribute mutations
    // are deliberately NOT observed (our own table stamping would loop), and
    // batches that don't touch a code-block/table subtree are skipped so
    // keystrokes elsewhere don't schedule measurement passes (edits still
    // reach the pass via the unconditional onChange schedule below).
    const mutationObserver = new MutationObserver((mutations) => {
      if (mutationsTouchDecoratedBlocks(mutations)) scheduleDecorationPass();
    });
    mutationObserver.observe(root, { childList: true, subtree: true, characterData: true });
    const resizeObserver = new ResizeObserver(scheduleDecorationPass);
    resizeObserver.observe(root);
    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      if (decorateFrameRef.current !== null) {
        cancelAnimationFrame(decorateFrameRef.current);
        decorateFrameRef.current = null;
      }
    };
  }, [scheduleDecorationPass]);

  // Re-measure when the expand set changes (the style override just landed).
  useEffect(() => {
    scheduleDecorationPass();
  }, [expandedCodeIds, scheduleDecorationPass]);

  const toggleCodeExpanded = useCallback((blockId: string) => {
    setExpandedCodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  }, []);

  // Per-id max-height lift for expanded code blocks, applied from OUTSIDE the
  // ProseMirror DOM and ANCHORED to this instance's wrapper attribute (see the
  // CodeToggle comment above) so it can never affect a sibling editor showing
  // the same block ids. Block ids are UUID-safe; useId output never contains
  // quotes/backslashes, but strip them anyway before interpolating.
  const expandedCodeCss = useMemo(() => {
    if (expandedCodeIds.size === 0) return '';
    const anchor = `[data-editor-instance="${instanceId.replace(/["\\]/g, '')}"]`;
    return [...expandedCodeIds]
      .filter((id) => SAFE_BLOCK_ID_RE.test(id))
      .map(
        (id) =>
          `${anchor} [data-id="${id}"] .bn-block-content[data-content-type='codeBlock'] > pre { max-height: none; }`,
      )
      .join('\n');
  }, [expandedCodeIds, instanceId]);

  editorDocRef.current = () => editor.document as unknown as UrlBlockLike[];

  const slashItems = useMemo<DefaultReactSuggestionItem[]>(() => {
    const base = getDefaultReactSlashMenuItems(editor).filter((item) => {
      const title = item.title.toLowerCase();
      if (!cfg.allowTables && title === 'table') return false;
      if (!cfg.allowImages && (title === 'image' || title === 'video' || title === 'audio' || title === 'file')) {
        return false;
      }
      return true;
    });

    // Put our blocks in the default "Advanced" group. We read the group label
    // off a known Advanced item (Table) so it matches the locale, and splice our
    // items in right after the last Advanced item — keeping the group contiguous
    // avoids a duplicate React key for the group header.
    const advGroup = base.find((i) => i.title.toLowerCase() === 'table')?.group ?? 'Advanced';

    const ours: DefaultReactSuggestionItem[] = [];
    if (cfg.allowMermaid) {
      ours.push({
        title: 'Mermaid diagram',
        subtext: 'Insert a Mermaid diagram',
        group: advGroup,
        icon: <Workflow size={18} />,
        aliases: ['mermaid', 'diagram', 'chart', 'flow'],
        onItemClick: () => {
          const cursor = editor.getTextCursorPosition();
          editor.insertBlocks([{ type: 'mermaid' }], cursor.block, 'after');
        },
      });
    }
    // File (KB asset) — inserts an empty fileAsset block; its own render then
    // offers "choose existing" / "create new" (see FileBlock.tsx). Only
    // offered when a FileAssetContext provider is present (KB pages).
    if (fileAssetProvider) {
      ours.push({
        title: 'File (KB asset)',
        subtext: 'Embed an existing KB file asset, or create a new one',
        group: advGroup,
        icon: <FileText size={18} />,
        aliases: ['file', 'asset', 'attachment', 'monaco'],
        onItemClick: () => {
          const cursor = editor.getTextCursorPosition();
          editor.insertBlocks([{ type: 'fileAsset' }], cursor.block, 'after');
        },
      });
    }
    // Diagram (draw.io KB asset) — inserts an empty drawio block; its own render
    // then offers "choose existing" / "create new" (see DrawioBlock.tsx). Only
    // offered when a DiagramAssetContext provider is present (KB pages).
    if (diagramAssetProvider) {
      ours.push({
        title: 'Diagram (draw.io)',
        subtext: 'Embed an existing KB diagram, or create a new one',
        group: advGroup,
        icon: <Workflow size={18} />,
        aliases: ['diagram', 'drawio', 'draw.io', 'flowchart', 'mxgraph'],
        onItemClick: () => {
          const cursor = editor.getTextCursorPosition();
          editor.insertBlocks([{ type: 'drawio' }], cursor.block, 'after');
        },
      });
    }
    // Callout — a single command that inserts a default callout and opens the
    // type picker (the same picker used to change an existing callout's type).
    ours.push({
      title: 'Callout',
      subtext: 'Insert a callout (note, info, warning, error, tip)',
      group: advGroup,
      icon: <MessageSquareQuote size={18} />,
      aliases: ['callout', 'admonition', 'panel', 'note', 'info', 'warning', 'error', 'tip'],
      onItemClick: () => {
        const id = crypto.randomUUID();
        pendingCalloutOpen.add(id);
        const cursor = editor.getTextCursorPosition();
        editor.insertBlocks(
          [{ id, type: 'callout', props: { calloutType: 'note' } }],
          cursor.block,
          'after',
        );
      },
    });

    // "Image with text wrap" — KB-only in v1 (approved decision; see
    // `profiles.ts` → `allowWrappedImage`). Inserts an empty wrappedImage
    // block; its own upload placeholder handles the file pick.
    if (cfg.allowWrappedImage) {
      ours.push({
        title: 'Image with text wrap',
        subtext: 'Insert an image that text flows around',
        group: advGroup,
        icon: <ImagePlus size={18} />,
        aliases: ['wrap', 'wrapped image', 'float', 'image wrap'],
        onItemClick: () => {
          const cursor = editor.getTextCursorPosition();
          editor.insertBlocks([{ type: 'wrappedImage' }], cursor.block, 'after');
        },
      });
    }

    const lastAdv = base.map((i) => i.group).lastIndexOf(advGroup);
    return lastAdv >= 0
      ? [...base.slice(0, lastAdv + 1), ...ours, ...base.slice(lastAdv + 1)]
      : [...base, ...ours];
  }, [editor, cfg, fileAssetProvider, diagramAssetProvider]);

  // Click-anywhere-to-focus: the editable content only fills the text itself,
  // so clicking the padding / empty space below the last line (common on the
  // short compact composer) did nothing. When a click lands on non-editable,
  // non-interactive chrome, focus the editor with the caret at the document end
  // so the whole box behaves like one text field.
  const focusOnEmptyAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const target = e.target as HTMLElement;
    if (
      target.closest('[contenteditable="true"]') ||
      target.closest('button, a, input, select, textarea, [role="button"]')
    ) {
      return; // already inside the editor, or on interactive chrome
    }
    e.preventDefault();
    const blocks = editor.document;
    const last = blocks[blocks.length - 1];
    if (last) {
      try {
        editor.setTextCursorPosition(last.id, 'end');
      } catch {
        /* block not focusable (e.g. image) — fall back to plain focus */
      }
    }
    editor.focus();
  };

  return (
    <div
      ref={wrapperRef}
      data-editor-instance={instanceId}
      className={['bn-editor-shell', className, cfg.compactSideMenu ? 'bn-compact-gutter' : '']
        .filter(Boolean)
        .join(' ')}
      style={{ minHeight: readOnly ? undefined : cfg.minHeight }}
      onMouseDown={focusOnEmptyAreaClick}
    >
      {expandedCodeCss !== '' && <style>{expandedCodeCss}</style>}
      <BlockNoteView
        editor={editor}
        editable={!readOnly}
        theme={resolvedTheme}
        slashMenu={false}
        // Compact surfaces use a custom side menu (drag-only, right gutter) —
        // disable the default one so it isn't rendered alongside ours.
        sideMenu={cfg.compactSideMenu ? false : undefined}
        // Stock toolbar. Table settings intentionally do NOT live here: the
        // toolbar needs a non-empty selection (a caret in a cell never shows
        // it) — they moved to the per-table anchored menu below (#1147).
        formattingToolbar={cfg.showFormattingToolbar}
        onChange={() => {
          onChange?.(editor.document);
          if (onMarkdownChange) {
            onMarkdownChange(editor.blocksToMarkdownLossy(editor.document));
          }
          // Prop-only updates (e.g. table border changes) don't produce
          // childList/characterData mutations, so re-decorate here too.
          scheduleDecorationPass();
        }}
      >
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) => filterSuggestionItems(slashItems, query)}
        />
        <GridSuggestionMenuController
          triggerCharacter=":"
          columns={10}
          minQueryLength={2}
          getItems={async (query) => getDefaultReactEmojiPickerItems(editor, query)}
        />
        <SuggestionMenuController
          triggerCharacter="@"
          getItems={async (query) =>
            filterSuggestionItems(getMentionMenuItems(editor, mentionUsers), query)
          }
        />
        {cfg.compactSideMenu && !readOnly && (
          // Drag-only side menu in the RIGHT gutter (no ＋ add-block button).
          <SideMenuController
            floatingUIOptions={{ useFloatingOptions: { placement: 'right-start' } }}
            sideMenu={(props) => (
              <SideMenu {...props}>
                <DragHandleButton {...props} />
              </SideMenu>
            )}
          />
        )}
      </BlockNoteView>
      {!readOnly && tableMenus.length > 0 && (
        // Per-table settings menus (borders + alignment, CR #1147 rework):
        // anchored buttons in the overlay (outside the ProseMirror DOM),
        // revealed on table hover or caret-inside-table, each opening a
        // Radix Popover with plain-button controls (see TableMenu.tsx for
        // why no nested Selects).
        <div className="bn-table-menu-layer">
          {tableMenus.map((menu) => (
            <TableMenu
              key={menu.blockId}
              editor={editor}
              blockId={menu.blockId}
              config={menu.config}
              top={menu.top}
              right={menu.right}
              visible={hoveredTableId === menu.blockId || caretTableId === menu.blockId}
              open={openTableMenuId === menu.blockId}
              onOpenChange={(open) => setOpenTableMenuId(open ? menu.blockId : null)}
              onHoverChange={(hovering) => markTableHovered(hovering ? menu.blockId : null)}
            />
          ))}
        </div>
      )}
      {codeGutters.length > 0 && (
        // Line-number gutters, rendered outside the ProseMirror DOM (see
        // CodeGutter) and positioned over each code block's left edge. One
        // pre-formatted text node per block; the inner column is translated
        // to mirror the pre's internal scroll (imperatively on scroll, and
        // from the ref'd scrollTop on re-render).
        <div className="bn-code-gutter-layer" aria-hidden="true">
          {codeGutters.map((gutter) => (
            <div
              key={gutter.blockId}
              className="bn-code-gutter"
              style={{ top: gutter.top, left: gutter.left, height: gutter.height }}
            >
              <div
                className="bn-code-gutter-inner"
                ref={(el) => {
                  if (el) gutterInnerRefs.current.set(gutter.blockId, el);
                  else gutterInnerRefs.current.delete(gutter.blockId);
                }}
                style={{
                  paddingTop: gutter.padTop,
                  lineHeight: `${gutter.lineHeight}px`,
                  transform: `translateY(${-(gutterScrollTopsRef.current.get(gutter.blockId) ?? 0)}px)`,
                }}
              >
                {lineNumbersText(gutter.rows)}
              </div>
            </div>
          ))}
        </div>
      )}
      {codeToggles.length > 0 && (
        // Expand/collapse buttons for over-tall code blocks, rendered outside
        // the ProseMirror DOM (see CodeToggle) and absolutely positioned over
        // each block's top-right corner. The language selector sits top-LEFT
        // (BlockNote core CSS), so the two never collide.
        <div className="bn-code-toggle-layer" contentEditable={false}>
          {codeToggles.map((toggle) => (
            <button
              key={toggle.blockId}
              type="button"
              className="bn-code-expand-btn"
              style={{ top: toggle.top, right: toggle.right }}
              onClick={() => toggleCodeExpanded(toggle.blockId)}
              onMouseDown={(e) => e.stopPropagation()}
              aria-expanded={toggle.expanded}
            >
              {toggle.expanded ? 'Collapse' : 'Expand'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
