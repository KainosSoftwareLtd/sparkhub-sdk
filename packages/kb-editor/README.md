# @sparkhub/kb-editor

The [BlockNote](https://www.blocknotejs.org/) **editor SparkHub's Knowledge Base uses**, packaged for partner apps. It writes the same `content` block array SparkHub's own editor writes — the shape `kb_get_page` returns and `kb_create_page` / `kb_update_page` accept — so a partner app authors KB pages **as blocks, never as a markdown detour** (every SparkHub block type round-trips: callouts, diagrams, files, wrapped images, mentions, typed anchors, bordered tables, highlighted code).

Pair it with [`@sparkhub/kb-viewer`](../kb-viewer) (read-only render) and [`@sparkhub/sdk`](../sdk) (PKCE sign-in + authenticated fetch + refresh).

## Install

```bash
npm i https://github.com/KainosSoftwareLtd/sparkhub-sdk/releases/download/v0.6.0/sparkhub-kb-editor-0.6.0.tgz
npm i @mantine/core @mantine/hooks   # peers (shared with @sparkhub/kb-viewer)
```

Peer deps: `react` / `react-dom` 18 or 19, `@mantine/core` / `@mantine/hooks` `^8.3.11 || ^9.0.2`.

## Use

```tsx
import { BlockEditor, type BlockEditorDocument } from '@sparkhub/kb-editor';
import '@sparkhub/kb-editor/style.css';

function SaveToKb({ seed }: { seed: BlockEditorDocument }) {
  const [doc, setDoc] = useState<BlockEditorDocument>(seed);
  return (
    <>
      <BlockEditor value={doc} onChange={setDoc} profile="full" />
      <button
        onClick={() =>
          sparkhub.fetch('/api/integration/kb_create_page', {
            method: 'POST',
            body: JSON.stringify({ args: { spaceSlug: 'signal', title: 'My page', content: doc } }),
          })
        }
      >
        Save as draft
      </button>
    </>
  );
}
```

Seeding from markdown (a Juno answer, an existing `body`) — server-safe entry:

```ts
import { parseSparkMD } from '@sparkhub/kb-editor/pure';
const content = await parseSparkMD(markdown); // BlockEditorDocument
```

## Props

| Prop | Type | Description |
|---|---|---|
| `value` | `BlockEditorDocument` | The block array. Controlled: pass what you last received from `onChange` (or a page's `content`). |
| `onChange` | `(doc: BlockEditorDocument) => void` | Fires on every edit with the full document. |
| `onMarkdownChange` | `(md: string) => void` *(optional)* | Same edits as a markdown projection (lossy; for previews/search only). |
| `profile` | `'full' \| 'compact' \| 'inline'` | Command/toolbar density. `full` = KB page (all blocks), `compact` = ticket body / message, `inline` = one-line description. |
| `readOnly` | `boolean` *(optional)* | Render without editing affordances. |
| `theme` | `'light' \| 'dark'` *(optional)* | Explicit theme. Omit to follow the host page's `data-theme` attribute on `<html>`, observed live. |
| `mentionUsers` | `MentionUser[]` *(optional)* | The `@`-mention roster: `{ id, name, email? }`. The editor never fetches it — a partner app lists org members through SparkHub with its own bearer and passes them in. |
| `resolveAnchor` | `(url: string) => Promise<AnchorProps \| null>` *(optional)* | Turns a pasted SparkHub URL into a typed anchor pill. Omit to keep pasted URLs as plain links. |
| `uploadFile` | `(file: File) => Promise<string>` *(optional)* | Image paste/drop → returns the URL to store (e.g. after `kb_upload_asset`). Omit to disable uploads. |
| `resolveMediaUrl` | `(url: string) => string` *(optional)* | Rewrites stored asset references to a URL your app can load (bare asset ids / SparkHub-relative paths do not resolve from a partner origin). |
| `className` | `string` *(optional)* | Extra class on the wrapper. |

Custom-block providers (optional React contexts, both exported): `FileAssetContext` (`FileAssetProvider` — `assets`, `canEdit`, `previewUrlFor`, `editUrlFor`, `createAsset`, and the host-supplied `renderPreview` for the file-asset code preview, e.g. a read-only Monaco; a plain `<pre>` without it) and `DiagramAssetContext` (`DiagramAssetProvider`). Without a provider the `fileAsset` / `drawio` blocks still render read-only and their slash-menu commands are hidden.

## `@sparkhub/kb-editor/pure` (server-safe)

No React, no DOM, no `@blocknote/react`. Safe in a Node backend or a SparkHub satellite route.

| Export | Purpose |
|---|---|
| `parseSparkMD(markdown)` / `parseMarkdownToBlocks(markdown)` | markdown → block array (remark-based, stable ids) |
| `blocksToMarkdown` / `blocksToPlainText` / `blocksToSparkMD` / `sparkMDToBlocks` | projections of a block array (lossy; markdown for search/preview, SparkMD = id-anchored agent view) |
| `applyBlockOps(doc, ops)` | id-addressed block operations (update / insertAfter / insertBefore / appendToEnd / move / delete), atomic |
| `blockDocumentArray({ maxBlocks })` | the zod guard SparkHub applies on write (block-count cap, byte cap, `javascript:` / `data:` URL sanitising) |
| `extractMentionUserIds` / `extractAnchors` / `isBlockDocumentEmpty` | helpers over a document |
| `sanitizeBlockDocumentUrls` / table-border helpers | as SparkHub uses them |

## What is deliberately NOT in the package

- **No network calls.** SparkHub's copy fetched the org roster and resolved anchors against SparkHub routes with cookies; a partner app runs on its own origin with a bearer, so those are props.
- **No Monaco.** The file-asset preview is host-supplied (`renderPreview`); Monaco stays in the host that already ships it.
- **No Tailwind / Radix.** Menus and popovers are Mantine (a peer shared with the viewer); the package's own CSS is `style.css`.

## Security notes

- Mermaid renders with `securityLevel: 'strict'`, `htmlLabels: false`, and the SVG passes DOMPurify's SVG profile (same as the viewer and SparkHub).
- `blockDocumentArray` neutralises `javascript:` / `data:` link URLs at the write boundary; SparkHub applies the same guard server-side on `kb_create_page` / `kb_update_page`, so a document the editor produces and one the API accepts are validated by one rule.

## License

MIT
