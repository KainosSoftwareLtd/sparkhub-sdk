/* eslint-disable @typescript-eslint/no-explicit-any -- emits BlockNote JSON
   blocks, which are structurally typed; node shapes are narrowed at runtime. */

/**
 * PURE markdown → BlockNote-blocks parser (remark/mdast only).
 *
 * A drop-in replacement for `@blocknote/server-util`'s
 * `editor.tryParseMarkdownToBlocks`, with NONE of its baggage: server-util
 * drags in `@blocknote/react` (React.createContext — fatal under the app-route
 * RSC react), `jsdom`, and `yjs`→`lib0` (unresolvable in the Vercel lambda), and
 * forced us to externalize `@blocknote/*` (which then broke the client editor's
 * CSS import). This module is plain `unified`/`remark` (already deps via the
 * block-id plugin) — no React, no DOM, no yjs, no externalization.
 *
 * It is wired in as the injected `parseFragment` of `sparkMDToBlocks`, exactly
 * where the server-util parser used to plug in (the seam was designed for this).
 * The output shape is matched against server-util's for every construct (see
 * `markdown-to-blocks.smoke.ts`); the surrounding SparkMD pre/post-processing
 * (mermaid fences, mentions, anchors) is unchanged and stays pure.
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type {
  Root,
  RootContent,
  PhrasingContent,
  ListItem,
  List,
  Paragraph,
  TableCell,
} from 'mdast';

/** A fresh block id — the WebCrypto global (Node ≥ 19 and every browser). */
function newBlockId(): string {
  return globalThis.crypto.randomUUID();
}

const processor = unified().use(remarkParse).use(remarkGfm);

type Styles = Record<string, true>;

const PARA_PROPS = { backgroundColor: 'default', textColor: 'default', textAlignment: 'left' } as const;

/** Convert mdast phrasing content → BlockNote inline content, accumulating marks. */
function inlineContent(nodes: PhrasingContent[], styles: Styles = {}): any[] {
  const out: any[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        out.push({ type: 'text', text: node.value, styles: { ...styles } });
        break;
      case 'strong':
        out.push(...inlineContent(node.children, { ...styles, bold: true }));
        break;
      case 'emphasis':
        out.push(...inlineContent(node.children, { ...styles, italic: true }));
        break;
      case 'delete':
        out.push(...inlineContent(node.children, { ...styles, strike: true }));
        break;
      case 'inlineCode':
        out.push({ type: 'text', text: node.value, styles: { ...styles, code: true } });
        break;
      case 'link':
        out.push({
          type: 'link',
          href: node.url,
          content: inlineContent(node.children, styles),
        });
        break;
      case 'break':
        out.push({ type: 'text', text: '\n', styles: { ...styles } });
        break;
      // Inline images / raw html are rare inside a paragraph; fall back to their
      // text so nothing is silently dropped.
      case 'image':
        if (node.alt) out.push({ type: 'text', text: node.alt, styles: { ...styles } });
        break;
      default:
        if ('value' in node && typeof (node as any).value === 'string') {
          out.push({ type: 'text', text: (node as any).value, styles: { ...styles } });
        }
    }
  }
  return out;
}

/** A paragraph that is just a single image becomes a top-level `image` block. */
function loneImage(p: Paragraph): { url: string; alt: string } | null {
  const kids = p.children.filter((c) => !(c.type === 'text' && c.value.trim() === ''));
  if (kids.length === 1 && kids[0].type === 'image') {
    return { url: kids[0].url, alt: kids[0].alt ?? '' };
  }
  return null;
}

function imageBlock(url: string, alt: string): any {
  return {
    id: newBlockId(),
    type: 'image',
    props: {
      textAlignment: 'left',
      backgroundColor: 'default',
      name: alt,
      url,
      caption: '',
      showPreview: true,
    },
    children: [],
  };
}

/** Expand an mdast list into a flat array of list-item blocks (nesting → children). */
function listItems(list: List): any[] {
  const type = list.ordered ? 'numberedListItem' : 'bulletListItem';
  return list.children.map((item: ListItem) => {
    // First paragraph supplies the item's inline content; everything else
    // (nested lists, extra paragraphs) becomes the item's children blocks.
    let content: any[] = [];
    const children: any[] = [];
    let tookContent = false;
    for (const child of item.children) {
      if (!tookContent && child.type === 'paragraph') {
        content = inlineContent(child.children);
        tookContent = true;
      } else {
        children.push(...blocksFromNode(child));
      }
    }
    return { id: newBlockId(), type, props: { ...PARA_PROPS }, content, children };
  });
}

function tableBlock(rows: { cells: TableCell[] }[]): any {
  const colCount = rows[0]?.cells.length ?? 0;
  return {
    id: newBlockId(),
    type: 'table',
    props: { textColor: 'default' },
    content: {
      type: 'tableContent',
      columnWidths: Array.from({ length: colCount }, () => null),
      headerRows: 1,
      rows: rows.map((row) => ({
        cells: row.cells.map((cell) => ({
          type: 'tableCell',
          content: inlineContent(cell.children),
          props: {
            colspan: 1,
            rowspan: 1,
            backgroundColor: 'default',
            textColor: 'default',
            textAlignment: 'left',
          },
        })),
      })),
    },
    children: [],
  };
}

/** Convert one top-level mdast node → zero or more BlockNote blocks. */
function blocksFromNode(node: RootContent): any[] {
  switch (node.type) {
    case 'heading':
      return [
        {
          id: newBlockId(),
          type: 'heading',
          props: { ...PARA_PROPS, level: Math.min(node.depth, 3) },
          content: inlineContent(node.children),
          children: [],
        },
      ];
    case 'paragraph': {
      const img = loneImage(node);
      if (img) return [imageBlock(img.url, img.alt)];
      return [
        { id: newBlockId(), type: 'paragraph', props: { ...PARA_PROPS }, content: inlineContent(node.children), children: [] },
      ];
    }
    case 'list':
      return listItems(node);
    case 'code':
      return [
        {
          id: newBlockId(),
          type: 'codeBlock',
          props: { language: node.lang || 'javascript' },
          content: node.value ? [{ type: 'text', text: node.value, styles: {} }] : [],
          children: [],
        },
      ];
    case 'blockquote': {
      // Gather inline content from the quote's paragraphs, separating each with
      // a newline (matches server-util's single-text multi-line quote).
      const content: any[] = [];
      for (const child of node.children) {
        if (child.type === 'paragraph') {
          if (content.length > 0) content.push({ type: 'text', text: '\n', styles: {} });
          content.push(...inlineContent(child.children));
        }
      }
      return [{ id: newBlockId(), type: 'quote', props: { backgroundColor: 'default', textColor: 'default' }, content, children: [] }];
    }
    case 'thematicBreak':
      return [{ id: newBlockId(), type: 'divider', props: {}, children: [] }];
    case 'table':
      return [tableBlock(node.children.map((r) => ({ cells: r.children })))];
    case 'html':
      // Raw HTML / `<!-- blk -->` anchors: SparkMD pre-processing handles anchors
      // before parsing; anything else is dropped (no BlockNote equivalent).
      return [];
    default:
      return [];
  }
}

/**
 * Parse markdown into BlockNote JSON blocks. Synchronous and pure — matches the
 * `ParseFragment` signature so it injects directly into `sparkMDToBlocks`.
 */
export function parseMarkdownToBlocks(markdown: string): any[] {
  const tree = processor.parse(markdown) as Root;
  const blocks: any[] = [];
  for (const node of tree.children) blocks.push(...blocksFromNode(node));
  return blocks;
}
