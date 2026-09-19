/* eslint-disable @typescript-eslint/no-explicit-any -- structural BlockNote JSON. */
/**
 * (vitest — `npm -w @sparkhub/kb-editor test`)
 * Smoke test for `applyBlockOps` (`block-ops.ts`), focused on the `wrappedImage`
 * update-preservation special case (side/widthPercent aren't representable in
 * markdown — see `README.md` → "Wrapped Image" and the comment above
 * `parseWrappedImageUpdateFragment`).
 *
 */
import { applyBlockOps } from './block-ops';
import { parseMarkdownToBlocks } from './markdown-to-blocks';
import { blocksToMarkdown, isBlockDocumentEmpty } from './sparkmd';

import { describe, it, expect } from 'vitest';

function check(cond: boolean, label: string): void {
  expect(cond, label).toBe(true);
}

describe('applyBlockOps', () => {
  const wrappedImageDoc: any[] = [
    {
      id: 'img1',
      type: 'wrappedImage',
      props: { url: 'https://x.com/old.png', caption: 'Old caption', side: 'right', widthPercent: 55 },
      content: [{ type: 'text', text: 'Old text', styles: {} }],
      children: [],
    },
  ];
  

  it('Update preserves side/widthPercent, changes url/caption/content', () => {
    const { doc, errors } = applyBlockOps(
      wrappedImageDoc,
      [{ op: 'update', id: 'img1', markdown: '![New caption](https://x.com/new.png)\nNew text' }],
      parseMarkdownToBlocks,
    );
    check(errors.length === 0, 'wrappedImage update: no errors');
    const b = doc[0];
    check(b.type === 'wrappedImage', 'wrappedImage update: type preserved');
    check(b.props.side === 'right' && b.props.widthPercent === 55, 'wrappedImage update: side/widthPercent preserved');
    check(b.props.url === 'https://x.com/new.png' && b.props.caption === 'New caption', 'wrappedImage update: url/caption updated');
    check(b.content?.[0]?.text === 'New text', 'wrappedImage update: content updated');
    check(b.id === 'img1', 'wrappedImage update: id preserved');
  });

  it('Update with no trailing text still preserves side/widthPercent and clears content', () => {
    const { doc, errors } = applyBlockOps(
      wrappedImageDoc,
      [{ op: 'update', id: 'img1', markdown: '![](https://x.com/new2.png)' }],
      parseMarkdownToBlocks,
    );
    check(errors.length === 0, 'wrappedImage update (image-only): no errors');
    check(doc[0].props.widthPercent === 55, 'wrappedImage update (image-only): widthPercent preserved');
    check(Array.isArray(doc[0].content) && doc[0].content.length === 0, 'wrappedImage update (image-only): content empty');
  });

  it('A fragment that doesn\'t start with an image line is rejected (doc unchanged), not silently downgraded', () => {
    const { doc, errors } = applyBlockOps(
      wrappedImageDoc,
      [{ op: 'update', id: 'img1', markdown: 'just some text, no image line' }],
      parseMarkdownToBlocks,
    );
    check(errors.length === 1, 'wrappedImage update (no image line): reports one error');
    check(doc[0].type === 'wrappedImage' && doc[0].props.url === 'https://x.com/old.png', 'wrappedImage update (no image line): doc unchanged');
  });

  it('A regular (non-wrappedImage) update is unaffected by the special case', () => {
    const plainDoc: any[] = [{ id: 'p1', type: 'paragraph', props: {}, content: [{ type: 'text', text: 'old', styles: {} }] }];
    const { doc, errors } = applyBlockOps(plainDoc, [{ op: 'update', id: 'p1', markdown: 'new' }], parseMarkdownToBlocks);
    check(errors.length === 0 && doc[0].type === 'paragraph' && doc[0].content[0].text === 'new', 'plain paragraph update unaffected');
  });

  it('sparkmd emission: plain image line + inline text, no HTML/custom directive', () => {
    const md = blocksToMarkdown(wrappedImageDoc);
    check(md === '![Old caption](https://x.com/old.png)\nOld text', 'sparkmd emission: image line + text, no HTML');
  });

  it('An image-only wrappedImage (no text) still counts as non-empty content', () => {
    const imageOnlyDoc: any[] = [
      { id: 'img2', type: 'wrappedImage', props: { url: 'https://x.com/a.png', caption: '', side: 'left', widthPercent: 40 }, content: [] },
    ];
    check(!isBlockDocumentEmpty(imageOnlyDoc), 'wrappedImage (image-only) is not an empty document');
  });

  it('Fresh markdown containing just an image is NOT auto-upgraded to wrappedImage', () => {
    const [img] = parseMarkdownToBlocks('![alt](https://x.com/plain.png)') as any[];
    check(img.type === 'image', 'plain markdown image parses to `image`, not `wrappedImage`');
  });

});
