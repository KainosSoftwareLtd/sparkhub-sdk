/* eslint-disable @typescript-eslint/no-explicit-any -- structural BlockNote JSON. */
/**
 * (vitest — `npm -w @sparkhub/kb-editor test`)
 * Smoke test for the pure markdown → BlockNote converter.
 *
 *
 * The expected shapes were captured 1:1 from `@blocknote/server-util`'s
 * `tryParseMarkdownToBlocks` (the parser this replaced); see the converter's
 * header. Block `id`s are random UUIDs and so are not asserted.
 */
import { parseMarkdownToBlocks } from './markdown-to-blocks';

import { describe, it, expect } from 'vitest';

function check(cond: boolean, label: string): void {
  expect(cond, label).toBe(true);
}

describe('parseMarkdownToBlocks', () => {
  it('Heading — level from depth (clamped to 3), full default props', () => {
    const [h1, , h3] = parseMarkdownToBlocks('# A\n## B\n### C') as any[];
    check(h1.type === 'heading' && h1.props.level === 1, 'heading level 1');
    check(h3.props.level === 3, 'heading level 3');
    check(
      h1.props.backgroundColor === 'default' && h1.props.textColor === 'default' && h1.props.textAlignment === 'left',
      'heading default props',
    );
    check(h1.content[0].type === 'text' && h1.content[0].text === 'A', 'heading text');
  });

  it('Inline styles + link', () => {
    const [p] = parseMarkdownToBlocks('x **b** _i_ `c` ~~s~~ [l](https://x.com)') as any[];
    const styled = (k: string) => p.content.some((c: any) => c.styles && c.styles[k] === true);
    check(styled('bold') && styled('italic') && styled('code') && styled('strike'), 'bold/italic/code/strike marks');
    const link = p.content.find((c: any) => c.type === 'link');
    check(!!link && link.href === 'https://x.com' && link.content[0].text === 'l', 'inline link');
  });

  it('Nested bullet list → nesting goes in children', () => {
    const blocks = parseMarkdownToBlocks('- a\n- b\n  - b1') as any[];
    check(blocks[0].type === 'bulletListItem', 'bullet list item');
    check(blocks[1].children.length === 1 && blocks[1].children[0].content[0].text === 'b1', 'nested list child');
  });

  it('Numbered list', () => {
    const [n] = parseMarkdownToBlocks('1. one') as any[];
    check(n.type === 'numberedListItem', 'numbered list item');
  });

  it('Code block — language + default', () => {
    const [c] = parseMarkdownToBlocks('```ts\nconst x = 1;\n```') as any[];
    check(c.type === 'codeBlock' && c.props.language === 'ts', 'code block language');
    const [c2] = parseMarkdownToBlocks('```\nplain\n```') as any[];
    check(c2.props.language === 'javascript', 'code block default language');
  });

  it('Divider has no content field', () => {
    const blocks = parseMarkdownToBlocks('a\n\n---\n\nb') as any[];
    const div = blocks.find((b) => b.type === 'divider');
    check(!!div && !('content' in div), 'divider has no content');
  });

  it('Table — tableContent / tableCell / headerRows', () => {
    const [t] = parseMarkdownToBlocks('| A | B |\n|---|---|\n| 1 | 2 |') as any[];
    check(t.type === 'table' && t.content.type === 'tableContent', 'table block');
    check(t.content.headerRows === 1 && t.content.rows.length === 2, 'table header + rows');
    check(t.content.rows[0].cells[0].type === 'tableCell', 'table cell type');
    check(t.content.columnWidths.length === 2, 'table column widths');
  });

  it('Image — standalone image becomes an image block', () => {
    const [img] = parseMarkdownToBlocks('![alt](https://x.com/i.png)') as any[];
    check(img.type === 'image' && img.props.url === 'https://x.com/i.png' && img.props.name === 'alt', 'image block');
  });

  it('Every block carries a string id', () => {
    const blocks = parseMarkdownToBlocks('# H\n\npara\n\n- item') as any[];
    check(blocks.every((b) => typeof b.id === 'string' && b.id.length > 0), 'all blocks have id');
  });

});
