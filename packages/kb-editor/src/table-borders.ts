import type { PropSchema, Props } from '@blocknote/core';

/**
 * Per-TABLE decoration config (CR #1147 — table scope only; row/col/cell
 * scopes are explicitly deferred): border style/width/color + alignment.
 *
 * The props are added to the built-in `table` block's propSchema in
 * `schema.ts` (the spec's TipTap node is `.extend()`ed with matching
 * attributes via `propsToAttributes`, so the values persist in the stored
 * BlockNote JSON and round-trip through `blockToNode`/`nodeToBlock` like any
 * built-in prop).
 *
 * This module is server-safe (no React/DOM imports at module level, DOM APIs
 * only inside functions that are exclusively called client-side).
 */

export const TABLE_BORDER_STYLES = ['solid', 'dashed', 'dotted', 'none'] as const;
export type TableBorderStyle = (typeof TABLE_BORDER_STYLES)[number];

export const TABLE_ALIGNMENTS = ['left', 'center', 'right'] as const;
export type TableAlignment = (typeof TABLE_ALIGNMENTS)[number];

export const TABLE_BORDER_MIN_WIDTH = 1;
export const TABLE_BORDER_MAX_WIDTH = 4;

/**
 * Defaults deliberately reproduce today's look (BlockNote's stock
 * 1px-solid cell grid, left-aligned table): a table whose props all equal
 * the defaults is rendered with NO SparkHub decoration at all (the sync pass
 * below removes the attributes/vars), so existing documents are
 * pixel-identical.
 */
export const TABLE_BORDER_DEFAULTS = {
  borderStyle: 'solid' as TableBorderStyle,
  borderWidth: 1,
  borderColor: 'var(--border)',
  tableAlignment: 'left' as TableAlignment,
};

export const tableBorderPropSchema = {
  borderStyle: {
    default: TABLE_BORDER_DEFAULTS.borderStyle as TableBorderStyle,
    values: TABLE_BORDER_STYLES,
  },
  borderWidth: { default: TABLE_BORDER_DEFAULTS.borderWidth },
  borderColor: { default: TABLE_BORDER_DEFAULTS.borderColor },
  tableAlignment: {
    default: TABLE_BORDER_DEFAULTS.tableAlignment as TableAlignment,
    values: TABLE_ALIGNMENTS,
  },
} satisfies PropSchema;

export type TableBorderProps = Props<typeof tableBorderPropSchema>;

/** Normalizes possibly-missing/legacy props into a full decoration config. */
export function resolveTableBorderProps(
  props: Record<string, unknown> | undefined,
): TableBorderProps {
  const rawStyle = props?.borderStyle;
  const borderStyle = TABLE_BORDER_STYLES.includes(rawStyle as TableBorderStyle)
    ? (rawStyle as TableBorderStyle)
    : TABLE_BORDER_DEFAULTS.borderStyle;
  const rawWidth = Number(props?.borderWidth);
  const borderWidth = Number.isFinite(rawWidth)
    ? Math.min(TABLE_BORDER_MAX_WIDTH, Math.max(TABLE_BORDER_MIN_WIDTH, Math.round(rawWidth)))
    : TABLE_BORDER_DEFAULTS.borderWidth;
  const borderColor =
    typeof props?.borderColor === 'string' && props.borderColor.trim() !== ''
      ? props.borderColor
      : TABLE_BORDER_DEFAULTS.borderColor;
  const rawAlign = props?.tableAlignment;
  const tableAlignment = TABLE_ALIGNMENTS.includes(rawAlign as TableAlignment)
    ? (rawAlign as TableAlignment)
    : TABLE_BORDER_DEFAULTS.tableAlignment;
  return { borderStyle, borderWidth, borderColor, tableAlignment };
}

/** True when the BORDER part of the config equals the defaults. */
export function isDefaultTableBorder(border: TableBorderProps): boolean {
  return (
    border.borderStyle === TABLE_BORDER_DEFAULTS.borderStyle &&
    border.borderWidth === TABLE_BORDER_DEFAULTS.borderWidth &&
    border.borderColor === TABLE_BORDER_DEFAULTS.borderColor
  );
}

/** Minimal structural block shape (avoids importing the schema — no cycles). */
export interface TableBorderBlockLike {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  children?: TableBorderBlockLike[];
}

export function collectTableBorderProps(
  blocks: readonly TableBorderBlockLike[],
  out: Map<string, TableBorderProps>,
): void {
  for (const block of blocks) {
    if (block.type === 'table') {
      out.set(block.id, resolveTableBorderProps(block.props));
    }
    if (block.children && block.children.length > 0) {
      collectTableBorderProps(block.children, out);
    }
  }
}

/**
 * Stamps the resolved decoration config onto each rendered table's
 * `.bn-block-content[data-content-type='table']` element:
 *  - `data-sh-border` + `--sh-table-border-{style,width,color}` inline CSS
 *    custom properties. `block-editor.css` CASCADES these to the CELLS
 *    (`… [data-sh-border] th/td`) — an HTML table's visible grid is drawn by
 *    the td/th borders under `border-collapse`, NOT by the container, so the
 *    rules must reach cell level.
 *  - `data-sh-align` for non-left alignment (CSS margins the inner `table`).
 * Default configs get everything REMOVED so stock tables keep BlockNote's
 * own look.
 *
 * Why DOM-stamping instead of relying on the node attributes' rendered
 * `data-*` output: BlockNote's persisted `BlockNoteTableView` only re-applies
 * the STOCK table props on node updates, so a live `updateBlock` would not
 * refresh custom attributes in the DOM. This sync runs from `BlockEditor`
 * (mount + onChange + MutationObserver) and is safe because the table node
 * view's `ignoreMutation` ignores every mutation outside `.tableWrapper-inner`
 * (do NOT copy this pattern for other block types — e.g. the code block's
 * node view does not ignore external mutations and ProseMirror would try to
 * re-read the DOM).
 */
export function syncTableBorderDecorations(
  root: HTMLElement,
  blocks: readonly TableBorderBlockLike[],
): void {
  const tables = root.querySelectorAll<HTMLElement>(
    ".bn-block-content[data-content-type='table']",
  );
  if (tables.length === 0) return;

  const byId = new Map<string, TableBorderProps>();
  collectTableBorderProps(blocks, byId);

  tables.forEach((el) => {
    const blockId = el.closest('[data-id]')?.getAttribute('data-id');
    const config = blockId ? byId.get(blockId) : undefined;

    if (!config || isDefaultTableBorder(config)) {
      el.removeAttribute('data-sh-border');
      el.style.removeProperty('--sh-table-border-style');
      el.style.removeProperty('--sh-table-border-width');
      el.style.removeProperty('--sh-table-border-color');
    } else {
      el.setAttribute('data-sh-border', config.borderStyle);
      // 'none' doesn't consume the vars (its CSS rules are fixed), but keeping
      // them in sync is harmless and simplifies switching styles.
      el.style.setProperty(
        '--sh-table-border-style',
        config.borderStyle === 'none' ? 'solid' : config.borderStyle,
      );
      el.style.setProperty('--sh-table-border-width', `${config.borderWidth}px`);
      el.style.setProperty('--sh-table-border-color', config.borderColor);
    }

    if (!config || config.tableAlignment === TABLE_BORDER_DEFAULTS.tableAlignment) {
      el.removeAttribute('data-sh-align');
    } else {
      el.setAttribute('data-sh-align', config.tableAlignment);
    }
  });
}
